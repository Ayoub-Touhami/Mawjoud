<#
.SYNOPSIS
  Publication en lot pour la démonstration : publie les fiches déjà prêtes, ou retire le dernier lot.

.DESCRIPTION
  - Sans option : n'écrit rien, affiche par gouvernorat le nombre de fiches qui seraient publiées et des autres.
  - -Publier : passe à « publiee » les fiches « pret_a_publier » (position confirmée, nom présent, ville et
    gouvernorat : contrainte pharmacie_publique_complete), nom marqué relu. Une seule transaction, par la
    transition autorisée pret_a_publier -> publiee : les déclencheurs restent actifs (aucun contournement).
    Chaque fiche est journalisée (changer_statut, « publication en lot (démonstration) », avec un numéro de lot
    et l'état d'avant).
  - -Retirer : remet les fiches du dernier lot à leur statut et à leur relecture d'avant (publiee -> pret_a_publier,
    transition autorisée). Une fiche modifiée depuis (plus « publiee ») est laissée et comptée à part. Journalisé.
  - Base : mawjoud seulement (-BaseTest : mawjoud_test, pour l'essai du script). Compte propriétaire (DATABASE_URL),
    mot de passe jamais affiché.
  - Démonstration seulement : la relecture réelle des noms et les autorisations de publication restent à faire
    avant une mise en ligne réelle (STATUT.md).

.EXAMPLE
  .\database\publier-lot-demo.ps1            # compte prévu, sans rien écrire
  .\database\publier-lot-demo.ps1 -Publier
  .\database\publier-lot-demo.ps1 -Retirer
#>
[CmdletBinding()]
param([switch]$Publier, [switch]$Retirer, [switch]$BaseTest)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'connexion-pg.ps1')

$MENTION = 'publication en lot (démonstration)'
$ELIGIBLE = "statut_publication = 'pret_a_publier' AND position_confirmee AND nom IS NOT NULL AND ville IS NOT NULL AND gouvernorat_code IS NOT NULL"

try {
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  if ($Publier -and $Retirer) { throw "Choisir -Publier ou -Retirer, pas les deux." }
  $base = if ($BaseTest) { 'mawjoud_test' } else { 'mawjoud' }
  $script:psql = Trouver-Outil 'psql'
  $c = Lire-Connexion $base
  if ($c.Base -cne $base -or $base -notin @('mawjoud', 'mawjoud_test')) { throw "Garde-fou : base refusée." }
  Definir-EnvPg $c $base 'mawjoud-lot-demo'
  Write-Host "Base : $base."

  if ($Publier) {
    $r = Requete @"
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE lot ON COMMIT DROP AS
  SELECT id, uuid, statut_publication AS avant, nom_a_verifier AS nom_avant FROM annuaire.pharmacie WHERE $ELIGIBLE FOR UPDATE;
CREATE TEMP TABLE numero ON COMMIT DROP AS SELECT gen_random_uuid()::text AS lot;
UPDATE annuaire.pharmacie p SET nom_a_verifier = false, statut_publication = 'publiee' FROM lot WHERE p.id = lot.id;
INSERT INTO prive.journal_audit (acteur_id, action, cible_type, cible_id, detail)
SELECT NULL, 'changer_statut', 'pharmacie', lot.uuid::text,
       jsonb_build_object('motif', '$MENTION', 'lot', numero.lot, 'de', lot.avant, 'vers', 'publiee', 'nomAVerifierAvant', lot.nom_avant)
  FROM lot, numero;
SELECT 'publiées : ' || count(*) || ' ; lot ' || (SELECT lot FROM numero) FROM lot;
COMMIT;
"@
    Write-Host ($r | Where-Object { $_ -like 'publiées*' })
  }
  elseif ($Retirer) {
    $r = Requete @"
\set ON_ERROR_STOP on
BEGIN;
CREATE TEMP TABLE dernier ON COMMIT DROP AS
  SELECT detail->>'lot' AS lot FROM prive.journal_audit
   WHERE action = 'changer_statut' AND detail->>'motif' = '$MENTION' ORDER BY id DESC LIMIT 1;
CREATE TEMP TABLE lot ON COMMIT DROP AS
  SELECT DISTINCT ON (j.cible_id) p.id, p.uuid, p.statut_publication AS actuel, j.detail->>'de' AS avant,
         (j.detail->>'nomAVerifierAvant')::boolean AS nom_avant
    FROM prive.journal_audit j JOIN dernier d ON j.detail->>'lot' = d.lot
    JOIN annuaire.pharmacie p ON p.uuid = j.cible_id::uuid
   WHERE j.detail->>'motif' = '$MENTION'
   ORDER BY j.cible_id, j.id DESC;
UPDATE annuaire.pharmacie p SET statut_publication = lot.avant, nom_a_verifier = lot.nom_avant
  FROM lot WHERE p.id = lot.id AND lot.actuel = 'publiee';
INSERT INTO prive.journal_audit (acteur_id, action, cible_type, cible_id, detail)
SELECT NULL, 'changer_statut', 'pharmacie', lot.uuid::text,
       jsonb_build_object('motif', 'retrait de la $MENTION', 'lot', (SELECT lot FROM dernier), 'de', 'publiee', 'vers', lot.avant)
  FROM lot WHERE lot.actuel = 'publiee';
SELECT 'retirées : ' || count(*) FILTER (WHERE actuel = 'publiee') || ' ; laissées (modifiées depuis) : ' || count(*) FILTER (WHERE actuel <> 'publiee') ||
       ' ; lot ' || coalesce((SELECT lot FROM dernier), 'aucun') FROM lot;
COMMIT;
"@
    Write-Host ($r | Where-Object { $_ -like 'retirées*' })
  }

  # Bilan par gouvernorat (après l'action, ou prévision sans option).
  $titre = if ($Publier -or $Retirer) { 'Après' } else { 'Prévision (rien n''est écrit)' }
  Write-Host "$titre, par gouvernorat : publiées (ou à publier) / non publiées"
  # Prévision : publiées + prêtes ; après une action : publiées seulement.
  $prevision = if ($Publier -or $Retirer) { 'false' } else { 'true' }
  $lignes = Requete @"
WITH f AS (
  SELECT gouvernorat_code, statut_publication = 'publiee' OR ($prevision AND $ELIGIBLE) AS compte
    FROM annuaire.pharmacie WHERE statut_publication <> 'fusionnee')
SELECT coalesce(g.nom, '(sans gouvernorat)') || ' : ' || count(*) FILTER (WHERE f.compte) || ' / ' || count(*) FILTER (WHERE NOT f.compte)
  FROM f LEFT JOIN annuaire.gouvernorat g ON g.code = f.gouvernorat_code
 GROUP BY g.code, g.nom ORDER BY g.code NULLS LAST;
"@
  $lignes | ForEach-Object { Write-Host "  $_" }
  $total = (Requete "SELECT count(*) FILTER (WHERE statut_publication = 'publiee') || ' publiées ; ' || count(*) FILTER (WHERE $ELIGIBLE) || ' prêtes à publier ; ' || count(*) || ' fiches' FROM annuaire.pharmacie WHERE statut_publication <> 'fusionnee';")[0]
  Write-Host "Total : $total."
}
catch {
  Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  Effacer-EnvPg
}
