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
}
catch {
  Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  Effacer-EnvPg
}
