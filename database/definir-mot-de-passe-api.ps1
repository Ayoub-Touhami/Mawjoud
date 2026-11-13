<#
.SYNOPSIS
  Donne un mot de passe aléatoire au compte mawjoud_api et l'écrit dans .env (API_DATABASE_URL).

.DESCRIPTION
  - Le mot de passe (32 octets aléatoires) n'est jamais affiché ni passé en argument.
  - Le serveur ne reçoit que son empreinte SCRAM-SHA-256, calculée ici : le mot de passe en clair
    n'apparaît dans aucune requête SQL, donc dans aucun journal du serveur.
  - Seule la ligne API_DATABASE_URL de .env est écrite ; les autres lignes restent identiques.
  - Exige la migration 025 (rôle mawjoud_api). Se connecte avec DATABASE_URL (compte postgres).

.PARAMETER Remplacer
  Obligatoire si API_DATABASE_URL existe déjà : change le mot de passe (l'ancien cesse de marcher).

.EXAMPLE
  .\database\definir-mot-de-passe-api.ps1
#>
[CmdletBinding()]
param([switch]$Remplacer)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'connexion-pg.ps1')

$fichierEnv = Join-Path $script:racineDepot '.env'

function Base64Url([byte[]]$octets) { [Convert]::ToBase64String($octets).TrimEnd('=').Replace('+', '-').Replace('/', '_') }

# PBKDF2-HMAC-SHA256, un seul bloc de 32 octets (vérifié sur les vecteurs de la RFC 7914).
function Pbkdf2Sha256([byte[]]$mdp, [byte[]]$sel, [int]$iterations) {
  $hmac = New-Object Security.Cryptography.HMACSHA256 (, $mdp)
  try {
    $u = $hmac.ComputeHash([byte[]]($sel + [byte[]](0, 0, 0, 1)))
    $r = [byte[]]$u.Clone()
    for ($i = 1; $i -lt $iterations; $i++) {
      $u = $hmac.ComputeHash($u)
      for ($j = 0; $j -lt 32; $j++) { $r[$j] = $r[$j] -bxor $u[$j] }
    }
    return , $r
  } finally { $hmac.Dispose() }
}

# Empreinte au format attendu par PostgreSQL (RFC 5802 / 7677).
function Empreinte-Scram([string]$motDePasse) {
  $alea = [Security.Cryptography.RandomNumberGenerator]::Create()
  $sel = New-Object byte[] 16; $alea.GetBytes($sel)
  $iterations = 4096
  $sale = Pbkdf2Sha256 ([Text.Encoding]::UTF8.GetBytes($motDePasse)) $sel $iterations
  $hmac = New-Object Security.Cryptography.HMACSHA256 (, $sale)
  try {
    $cleClient  = $hmac.ComputeHash([Text.Encoding]::ASCII.GetBytes('Client Key'))
    $cleServeur = $hmac.ComputeHash([Text.Encoding]::ASCII.GetBytes('Server Key'))
  } finally { $hmac.Dispose() }
  $sha = [Security.Cryptography.SHA256]::Create()
  $cleStockee = $sha.ComputeHash($cleClient); $sha.Dispose()
  $b64 = { param($o) [Convert]::ToBase64String($o) }
  return "SCRAM-SHA-256`$$($iterations):$(& $b64 $sel)`$$(& $b64 $cleStockee):$(& $b64 $cleServeur)"
}

try {
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  $script:psql = Trouver-Outil 'psql'
  $c = Lire-Connexion
  if (-not (Test-Path -LiteralPath $fichierEnv)) { throw ".env absent à la racine du dépôt." }
  $lignes = @(Get-Content -LiteralPath $fichierEnv -Encoding UTF8)
  $existe = @($lignes | Where-Object { $_ -match '^\s*API_DATABASE_URL\s*=' }).Count -gt 0
  if ($existe -and -not $Remplacer) {
    throw "API_DATABASE_URL existe déjà dans .env. Relancer avec -Remplacer pour changer le mot de passe."
  }

  Definir-EnvPg $c $c.Base 'mawjoud-role-api'
  $etat = Requete "SELECT rolcanlogin::text || ' ' || rolsuper::text FROM pg_roles WHERE rolname = 'mawjoud_api';"
  if ($etat.Count -eq 0) { throw "Rôle mawjoud_api absent : appliquer d'abord la migration 025." }
  if ($etat[0] -ne 'true false') { throw "Rôle mawjoud_api inattendu (connexion ou superutilisateur) : arrêt." }

  # 1. Mot de passe aléatoire (256 bits), caractères sûrs dans une URL.
  $octets = New-Object byte[] 32
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($octets)
  $motDePasse = Base64Url $octets

  # 2. Le serveur reçoit seulement l'empreinte, par variable d'environnement lue par psql.
  $env:MAWJOUD_SCRAM = Empreinte-Scram $motDePasse
  "\set ON_ERROR_STOP on`n\getenv empreinte MAWJOUD_SCRAM`nALTER ROLE mawjoud_api PASSWORD :'empreinte';" |
    & $script:psql -X -q -f -
  if ($LASTEXITCODE -ne 0) { throw "ALTER ROLE a échoué (code $LASTEXITCODE)." }
  Remove-Item Env:MAWJOUD_SCRAM

  # 3. .env : seule la ligne API_DATABASE_URL change.
  $url = "API_DATABASE_URL=postgresql://mawjoud_api:$motDePasse@$($c.Hote):$($c.Port)/mawjoud"
  $nouvelles = @($lignes | Where-Object { $_ -notmatch '^\s*API_DATABASE_URL\s*=' }) + $url
  [IO.File]::WriteAllLines($fichierEnv, [string[]]$nouvelles, (New-Object Text.UTF8Encoding $false))
  Write-Host "Mot de passe de mawjoud_api changé et écrit dans .env (API_DATABASE_URL), non affiché."

  # 4. Contrôle : connexion avec le nouveau mot de passe.
  $env:PGUSER = 'mawjoud_api'; $env:PGPASSWORD = $motDePasse
  $verif = Requete "SELECT current_user || ' ; superutilisateur : ' || rolsuper || ' ; base : ' || current_database() FROM pg_roles WHERE rolname = current_user;"
  Write-Host "Connexion vérifiée : $($verif[0])."
}
catch {
  Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  Remove-Item Env:MAWJOUD_SCRAM -ErrorAction SilentlyContinue
  $motDePasse = $null
  Effacer-EnvPg
}
