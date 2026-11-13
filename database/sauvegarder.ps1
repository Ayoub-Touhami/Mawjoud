<#
.SYNOPSIS
  Sauvegarde une base du projet (pg_dump, format personnalisé) hors du dépôt, avec un manifeste de contrôle.

.DESCRIPTION
  - Se connecte avec DATABASE_URL (compte propriétaire), lue dans .env : le mot de passe passe par la variable
    d'environnement PGPASSWORD le temps de la commande, jamais en argument, jamais affiché, jamais dans
    l'historique de PowerShell (aucun mot de passe à taper).
  - Écrit <base>-AAAAMMJJ-HHMMSS.dump dans ..\sauvegardes\ (à côté du dépôt et de ..\data\), jamais dans le
    dépôt : une sauvegarde contient des données personnelles (comptes, alertes = données de santé).
  - Écrit à côté <même nom>.manifeste.json : nombre de lignes par table, dernière migration, empreinte SHA-256
    du fichier. Il sert à contrôler une restauration (docs/SECURITE.md, « Sauvegarde et restauration »).
  - Bases acceptées : mawjoud et mawjoud_test (connexion-pg.ps1). Chiffrement et copie hors de la machine :
    à décider avec l'hébergement (STATUT.md, « À faire plus tard »).

.PARAMETER Base
  mawjoud (par défaut) ou mawjoud_test.

.PARAMETER Dossier
  Dossier de destination ; par défaut ..\sauvegardes à côté du dépôt. Refusé s'il est dans le dépôt.

.EXAMPLE
  .\database\sauvegarder.ps1
#>
[CmdletBinding()]
param(
  [ValidateSet('mawjoud', 'mawjoud_test')][string]$Base = 'mawjoud',
  [string]$Dossier
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'connexion-pg.ps1')

try {
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  $script:psql = Trouver-Outil 'psql'
  $pgdump = Trouver-Outil 'pg_dump'
  $c = Lire-Connexion $Base
  if ($c.Base -cne $Base) { throw "Garde-fou : base inattendue." }

  $depot = (Resolve-Path $script:racineDepot).Path.TrimEnd('\')
  if (-not $Dossier) { $Dossier = Join-Path (Split-Path $depot -Parent) 'sauvegardes' }
  New-Item -ItemType Directory -Force -Path $Dossier | Out-Null
  $Dossier = (Resolve-Path $Dossier).Path.TrimEnd('\')
  if (($Dossier + '\').StartsWith($depot + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw "Le dossier de sauvegarde est dans le dépôt : refusé (données personnelles)."
  }

  $nom = '{0}-{1}' -f $Base, (Get-Date -Format 'yyyyMMdd-HHmmss')
  $fichier = Join-Path $Dossier "$nom.dump"
  Definir-EnvPg $c $Base 'mawjoud-sauvegarde'

  # Comptes avant la sauvegarde (même instantané que pg_dump à quelques secondes près ; la base doit être calme).
  $lignes = Requete @"
SELECT n.nspname || '.' || c.relname || '=' ||
       (xpath('/row/n/text()', query_to_xml(format('SELECT count(*) AS n FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE c.relkind = 'r' AND n.nspname IN ('public', 'annuaire', 'prive') ORDER BY 1;
"@
  $migration = (Requete "SELECT max(version) FROM public.schema_migrations;")[0]

  & $pgdump --format=custom --compress=6 --no-password --file=$fichier
  if ($LASTEXITCODE -ne 0) { throw "pg_dump a échoué (code $LASTEXITCODE)." }

  $tables = [ordered]@{}
  foreach ($l in $lignes) { $k, $v = $l.Split('=', 2); $tables[$k] = [int64]$v }
  $manifeste = [ordered]@{
    base = $Base; fichier = "$nom.dump"; cree_le = (Get-Date).ToString('o'); derniere_migration = $migration
    octets = (Get-Item $fichier).Length; sha256 = (Get-FileHash $fichier -Algorithm SHA256).Hash.ToLower(); lignes = $tables
  }
  [IO.File]::WriteAllText((Join-Path $Dossier "$nom.manifeste.json"), ($manifeste | ConvertTo-Json -Depth 4), (New-Object Text.UTF8Encoding $false))

  Write-Host "Sauvegarde : $fichier ($([math]::Round($manifeste.octets / 1KB)) Ko, SHA-256 $($manifeste.sha256.Substring(0, 16))…)."
  Write-Host "Manifeste : $nom.manifeste.json ($($tables.Count) tables, $(($tables.Values | Measure-Object -Sum).Sum) lignes, migration $migration)."
}
catch {
  Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  Effacer-EnvPg
}
