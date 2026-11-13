<#
.SYNOPSIS
  Applique, dans l'ordre, les migrations de database/migrations absentes de schema_migrations.

.DESCRIPTION
  - Lit DATABASE_URL dans .env, à la racine du dépôt. N'affiche jamais le mot de passe :
    il est transmis à psql par la variable d'environnement PGPASSWORD, jamais en argument.
  - Refuse de travailler sur les bases cleanapp, postgres, template0 et template1.
  - Chaque fichier contient sa propre transaction (BEGIN … COMMIT) et commence par
    \set ON_ERROR_STOP on : le script s'arrête à la première erreur.
  - Après au moins une migration appliquée, régénère database/schema.sql avec
    pg_dump --schema-only (copie générée, ne jamais la modifier à la main).

.PARAMETER Lister
  Affiche les migrations appliquées et en attente, sans rien changer.

.PARAMETER CreerBase
  Crée la base (encodage UTF8) si elle n'existe pas encore.

.PARAMETER SansSchema
  Ne régénère pas schema.sql.

.PARAMETER BaseTest
  Travaille sur la base des tests automatiques, mawjoud_test (même serveur, même compte que DATABASE_URL).
  schema.sql n'est jamais régénéré depuis cette base.

.EXAMPLE
  .\database\appliquer-migrations.ps1 -Lister
  .\database\appliquer-migrations.ps1 -CreerBase
#>
[CmdletBinding()]
param(
  [switch]$Lister,
  [switch]$CreerBase,
  [switch]$SansSchema,
  [switch]$BaseTest
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

. (Join-Path $PSScriptRoot 'connexion-pg.ps1')

$dossierMig = Join-Path $PSScriptRoot 'migrations'
$schemaSql  = Join-Path $PSScriptRoot 'schema.sql'

try {
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  $script:psql = Trouver-Outil 'psql'
  $c = if ($BaseTest) { Lire-Connexion 'mawjoud_test' } else { Lire-Connexion }
  Write-Host "Cible : base « $($c.Base) » sur $($c.Hote):$($c.Port), utilisateur $($c.Utilisateur)."

  # Fichiers de migrations : NNN_nom.sql, numéros uniques.
  $fichiers = @(Get-ChildItem -LiteralPath $dossierMig -Filter '*.sql' | Sort-Object Name)
  foreach ($f in $fichiers) {
    if ($f.Name -notmatch '^\d{3}_[a-z0-9_]+\.sql$') { throw "Nom de migration invalide : $($f.Name) (attendu : 001_nom.sql)." }
  }
  $doublons = $fichiers | Group-Object { $_.Name.Substring(0, 3) } | Where-Object Count -gt 1
  if ($doublons) { throw "Numéros de migration en double : $(($doublons | ForEach-Object Name) -join ', ')." }

  # Existence de la base (vérifiée depuis la base d'administration, en lecture seule).
  Definir-EnvPg $c 'postgres' 'mawjoud-migrations'
  $baseLitt = $c.Base.Replace("'", "''")
  $existe = (Requete "SELECT count(*) FROM pg_database WHERE datname = '$baseLitt';")[0] -eq '1'
  if (-not $existe) {
    if ($Lister -or -not $CreerBase) {
      Write-Host "La base « $($c.Base) » n'existe pas. Relancer avec -CreerBase pour la créer."
      if ($Lister) { exit 0 } else { exit 1 }
    }
    $baseIdent = '"' + $c.Base.Replace('"', '""') + '"'
    Requete "CREATE DATABASE $baseIdent WITH ENCODING 'UTF8' TEMPLATE template0;" | Out-Null
    Write-Host "Base « $($c.Base) » créée (UTF8)."
  }

  Definir-EnvPg $c $c.Base 'mawjoud-migrations'
  $registre = (Requete "SELECT to_regclass('public.schema_migrations') IS NOT NULL;")[0] -eq 't'
  $appliquees = @()
  if ($registre) { $appliquees = Requete "SELECT version FROM public.schema_migrations ORDER BY version;" }

  $connues = $fichiers | ForEach-Object { $_.Name.Substring(0, 3) }
  $orphelines = @($appliquees | Where-Object { $connues -notcontains $_ })
  if ($orphelines.Count) { Write-Warning "Migrations enregistrées sans fichier : $($orphelines -join ', ')." }

  $enAttente = @($fichiers | Where-Object { $appliquees -notcontains $_.Name.Substring(0, 3) })
  Write-Host "Appliquées : $($appliquees.Count). En attente : $($enAttente.Count)."

  if ($Lister) {
    foreach ($f in $fichiers) {
      $etat = if ($appliquees -contains $f.Name.Substring(0, 3)) { 'appliquée ' } else { 'en attente' }
      Write-Host "  [$etat] $($f.Name)"
    }
    exit 0
  }

  foreach ($f in $enAttente) {
    Write-Host "→ $($f.Name)"
    & $script:psql -X -q -v ON_ERROR_STOP=1 -f $f.FullName
    if ($LASTEXITCODE -ne 0) {
      throw "Échec de $($f.Name) (code $LASTEXITCODE). Sa transaction est annulée ; les suivantes ne sont pas appliquées."
    }
  }

  if ($enAttente.Count -gt 0 -and -not $SansSchema -and -not $BaseTest) {
    $pgDump = Trouver-Outil 'pg_dump'
    # Clé \restrict fixe : sans elle, pg_dump en tire une au hasard et schema.sql changerait à chaque fois.
    & $pgDump --schema-only --no-owner --restrict-key=mawjoud --encoding=UTF8 --file=$schemaSql
    if ($LASTEXITCODE -ne 0) { throw "Échec de pg_dump (code $LASTEXITCODE)." }
    Write-Host "schema.sql régénéré."
  }
  Write-Host "Terminé."
}
catch {
  Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  Effacer-EnvPg
}
