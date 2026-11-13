<#
.SYNOPSIS
  Importe le catalogue de référence des médicaments (medicaments_200.csv, R001 à R200).

.DESCRIPTION
  - Rejouable : relancé, il n'ajoute rien et ne crée aucun doublon.
  - Une seule transaction, avec contrôles avant (200 lignes, identifiants, aucune marque, aucun doublon)
    et après (200 médicaments R, médicaments de test inchangés, aucune disponibilité créée).
  - Ce catalogue n'est PAS la nomenclature officielle : à faire relire par un pharmacien avant publication.
  - Le CSV reste hors du dépôt (../data/final). Mot de passe jamais affiché (connexion-pg.ps1).

.PARAMETER Catalogue
  Chemin du CSV. Défaut : ..\data\final\medicaments_200.csv à côté du dépôt.

.PARAMETER BaseTest
  Importe dans mawjoud_test au lieu de mawjoud.
#>
[CmdletBinding()]
param([string]$Catalogue, [switch]$BaseTest)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'connexion-pg.ps1')

try {
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  $script:psql = Trouver-Outil 'psql'
  if (-not $Catalogue) { $Catalogue = Join-Path (Split-Path -Parent $script:racineDepot) 'data\final\medicaments_200.csv' }
  if (-not (Test-Path -LiteralPath $Catalogue -PathType Leaf)) { throw "Fichier introuvable : $Catalogue" }
  $chemin = (Resolve-Path -LiteralPath $Catalogue).ProviderPath
  if ($chemin.Contains("'")) { throw "Chemin avec apostrophe non pris en charge." }

  $c = if ($BaseTest) { Lire-Connexion 'mawjoud_test' } else { Lire-Connexion }
  Write-Host "Cible : base « $($c.Base) » ; catalogue : $chemin"
  Definir-EnvPg $c $c.Base 'mawjoud-import-medicaments'
  & $script:psql -X -q -A -t -v ON_ERROR_STOP=1 -v "f_catalogue=$($chemin.Replace('\', '/'))" -f (Join-Path $PSScriptRoot 'import\importer_medicaments_reference.sql')
  if ($LASTEXITCODE -ne 0) { throw "Échec de l'import (code $LASTEXITCODE) : transaction annulée, rien n'a été écrit." }
}
catch {
  Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  Effacer-EnvPg
}
