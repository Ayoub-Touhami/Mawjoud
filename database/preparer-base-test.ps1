<#
.SYNOPSIS
  Recrée la base des tests automatiques, mawjoud_test, vide, avec toutes les migrations.

.DESCRIPTION
  - Ne touche qu'à la base nommée exactement mawjoud_test (contrôle en dur, en plus de la liste
    des bases acceptées dans connexion-pg.ps1). mawjoud, cleanapp et postgres ne sont jamais visées.
  - Supprime puis recrée mawjoud_test (UTF8), puis applique les migrations avec
    appliquer-migrations.ps1 -BaseTest. Aucune donnée n'est importée : les tests créent les leurs.
  - Se connecte avec DATABASE_URL (compte postgres) ; mot de passe jamais affiché.

.EXAMPLE
  .\database\preparer-base-test.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'connexion-pg.ps1')

$baseTest = 'mawjoud_test'

try {
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  $script:psql = Trouver-Outil 'psql'
  $c = Lire-Connexion $baseTest
  if ($c.Base -cne 'mawjoud_test') { throw "Garde-fou : la base visée n'est pas mawjoud_test." }

  # DROP et CREATE DATABASE se font depuis la base d'administration, sans y rien modifier.
  Definir-EnvPg $c 'postgres' 'mawjoud-base-test'
  Requete "DROP DATABASE IF EXISTS mawjoud_test WITH (FORCE);" | Out-Null
  Requete "CREATE DATABASE mawjoud_test WITH ENCODING 'UTF8' TEMPLATE template0;" | Out-Null
  Write-Host "Base mawjoud_test recréée (vide, UTF8)."
  Effacer-EnvPg

  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'appliquer-migrations.ps1') -BaseTest
  if ($LASTEXITCODE -ne 0) { throw "Migrations de mawjoud_test en échec (code $LASTEXITCODE)." }

  # Rôle des données de test (décision du 13 novembre 2026, Partie 8). mawjoud_api n'a plus INSERT sur
  # annuaire.pharmacie (032) : pour créer leurs fiches, les tests prennent ce rôle (SET ROLE, sans hériter
  # de ses droits), qui n'a de droits QUE dans mawjoud_test. Le rôle est commun au serveur, mais dans mawjoud
  # il ne peut rien faire. Les tests vérifient que mawjoud_api seul ne peut toujours pas insérer.
  Definir-EnvPg $c 'mawjoud_test' 'mawjoud-base-test'
  Requete @"
DO `$`$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mawjoud_test_fixtures') THEN
    CREATE ROLE mawjoud_test_fixtures NOLOGIN NOINHERIT;
  END IF;
END `$`$;
GRANT USAGE ON SCHEMA annuaire TO mawjoud_test_fixtures;
GRANT SELECT, INSERT ON annuaire.pharmacie, annuaire.horaire, annuaire.historique_position TO mawjoud_test_fixtures;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA annuaire TO mawjoud_test_fixtures;
-- Partie 9d (migration 036) : mawjoud_api n'écrit plus le catalogue, les signalements, ni ne supprime de compte ;
-- les tests le font par ce rôle, dans mawjoud_test seulement.
GRANT SELECT, INSERT ON annuaire.medicament TO mawjoud_test_fixtures;
GRANT SELECT, UPDATE ON prive.session, prive.jeton TO mawjoud_test_fixtures;
GRANT USAGE ON SCHEMA prive TO mawjoud_test_fixtures;
GRANT SELECT, INSERT ON prive.signalement TO mawjoud_test_fixtures;
GRANT SELECT, DELETE ON prive.utilisateur TO mawjoud_test_fixtures;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA prive TO mawjoud_test_fixtures;
GRANT mawjoud_test_fixtures TO mawjoud_api WITH INHERIT FALSE, SET TRUE;
"@ | Out-Null
  Write-Host "Rôle mawjoud_test_fixtures prêt (droits dans mawjoud_test seulement)."

  # Remise à zéro au début de chaque fichier de tests (décision du 13 novembre 2026, Partie 9d).
  # Fonction créée ici seulement (jamais par une migration) : elle n'existe que dans mawjoud_test.
  # SECURITY DEFINER (propriétaire postgres) : elle vide toutes les tables de données, y compris celles en
  # ajout seul (déclencheurs de vidage suspendus pour sa seule transaction) ; les référentiels remplis par
  # les migrations (gouvernorats, schema_migrations) sont gardés. Exécutable par mawjoud_test_fixtures
  # seulement, et refuse de tourner dans une autre base que mawjoud_test.
  Requete @"
CREATE SCHEMA IF NOT EXISTS essai;
REVOKE ALL ON SCHEMA essai FROM PUBLIC;
CREATE OR REPLACE FUNCTION essai.reinitialiser() RETURNS integer
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS `$`$
DECLARE
  tables text;
  n integer;
BEGIN
  IF current_database() <> 'mawjoud_test' THEN
    RAISE EXCEPTION 'Remise à zéro refusée hors de mawjoud_test.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT string_agg(format('%I.%I', n.nspname, c.relname), ', '), count(*)
    INTO tables, n
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE c.relkind = 'r' AND n.nspname IN ('annuaire', 'prive')
     AND (n.nspname, c.relname) <> ('annuaire', 'gouvernorat');
  SET LOCAL session_replication_role = replica;
  EXECUTE 'TRUNCATE ' || tables || ' RESTART IDENTITY CASCADE';
  SET LOCAL session_replication_role = origin;
  RETURN n;
END;
`$`$;
REVOKE ALL ON FUNCTION essai.reinitialiser() FROM PUBLIC;
GRANT USAGE ON SCHEMA essai TO mawjoud_test_fixtures;
GRANT EXECUTE ON FUNCTION essai.reinitialiser() TO mawjoud_test_fixtures;
"@ | Out-Null
  Write-Host "Fonction essai.reinitialiser() prête (mawjoud_test seulement)."
}
catch {
  Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  Effacer-EnvPg
}
