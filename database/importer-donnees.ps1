<#
.SYNOPSIS
  Importe les CSV des pharmacies et des médicaments de test dans la base, puis vérifie les chiffres.

.DESCRIPTION
  - Lit DATABASE_URL dans .env (mot de passe jamais affiché : voir connexion-pg.ps1).
  - Exige que toutes les migrations soient appliquées.
  - Import en une seule transaction (database/import/importer.sql) : à la moindre erreur, rien n'est écrit.
    Refuse de s'exécuter si la base contient déjà des pharmacies ou des médicaments.
  - Puis vérifications chiffrées (database/import/verifier_import.sql), sans écriture.
  - Les CSV restent hors du dépôt (dossier ../data) : ils ne vont jamais dans Git.

.PARAMETER DossierDonnees
  Dossier des CSV des pharmacies. Défaut : ..\data\final à côté du dépôt.

.PARAMETER Medicaments
  CSV des médicaments. Défaut : ..\data\medicaments_test.csv à côté du dépôt.

.PARAMETER VerifierSeulement
  Ne fait que les vérifications chiffrées.

.EXAMPLE
  .\database\importer-donnees.ps1
  .\database\importer-donnees.ps1 -VerifierSeulement
#>
[CmdletBinding()]
param(
  [string]$DossierDonnees,
  [string]$Medicaments,
  [switch]$VerifierSeulement
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'connexion-pg.ps1')

$dossierParent = Split-Path -Parent $script:racineDepot
if (-not $DossierDonnees) { $DossierDonnees = Join-Path $dossierParent 'data\final' }
if (-not $Medicaments)    { $Medicaments    = Join-Path $dossierParent 'data\medicaments_test.csv' }
$sqlImport   = Join-Path $PSScriptRoot 'import\importer.sql'
$sqlVerifier = Join-Path $PSScriptRoot 'import\verifier_import.sql'

# Chemin absolu, barres obliques, sans apostrophe (il est placé entre apostrophes dans \copy).
function Chemin-Csv([string]$chemin) {
  if (-not (Test-Path -LiteralPath $chemin -PathType Leaf)) { throw "Fichier introuvable : $chemin" }
  $plein = (Resolve-Path -LiteralPath $chemin).ProviderPath
  if ($plein.Contains("'")) { throw "Chemin avec apostrophe non pris en charge : $plein" }
  return $plein.Replace('\', '/')
}

try {
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  $script:psql = Trouver-Outil 'psql'
  $c = Lire-Connexion
  Write-Host "Cible : base « $($c.Base) » sur $($c.Hote):$($c.Port), utilisateur $($c.Utilisateur)."
  Definir-EnvPg $c $c.Base 'mawjoud-import'

  # Toutes les migrations doivent être passées.
  $fichiersMig = @(Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'migrations') -Filter '*.sql' |
                   ForEach-Object { $_.Name.Substring(0, 3) })
  $appliquees = Requete "SELECT version FROM public.schema_migrations;"
  $manquantes = @($fichiersMig | Where-Object { $appliquees -notcontains $_ })
  if ($manquantes.Count) { throw "Migrations non appliquées : $($manquantes -join ', '). Lancer d'abord appliquer-migrations.ps1." }

  if (-not $VerifierSeulement) {
    $f = @{
      f_final       = Chemin-Csv (Join-Path $DossierDonnees 'pharmacies_final.csv')
      f_attente     = Chemin-Csv (Join-Path $DossierDonnees 'pharmacies_en_attente_position.csv')
      f_interne     = Chemin-Csv (Join-Path $DossierDonnees 'pharmacies_interne.csv')
      f_medicaments = Chemin-Csv $Medicaments
    }
    Write-Host "Import (une seule transaction)…"
    $argsVar = foreach ($k in $f.Keys) { '-v'; "$k=$($f[$k])" }
    & $script:psql -X -q -A -t -v ON_ERROR_STOP=1 @argsVar -f $sqlImport
    if ($LASTEXITCODE -ne 0) { throw "Échec de l'import (code $LASTEXITCODE) : transaction annulée, rien n'a été écrit." }
    Write-Host "Import terminé."
  }

  Write-Host "Vérifications chiffrées…"
  & $script:psql -X -q -v ON_ERROR_STOP=1 -f $sqlVerifier
  if ($LASTEXITCODE -ne 0) { throw "Vérifications non conformes (code $LASTEXITCODE)." }
  Write-Host "Terminé."
}
catch {
  Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  Effacer-EnvPg
}
