# Fonctions communes aux scripts de la base (à charger avec « . $PSScriptRoot\connexion-pg.ps1 »).
# Le mot de passe de DATABASE_URL n'est jamais affiché ni passé en argument :
# il va à psql et pg_dump par la variable d'environnement PGPASSWORD, effacée à la fin.

$script:racineDepot     = Split-Path -Parent $PSScriptRoot
$script:basesInterdites = @('cleanapp', 'postgres', 'template0', 'template1')
# Seules bases que ces scripts acceptent de modifier : la base du projet et la base des tests automatiques.
$script:basesAutorisees = @('mawjoud', 'mawjoud_test')

function Trouver-Outil([string]$nom) {
  $cmd = Get-Command $nom -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  $defaut = "C:\Program Files\PostgreSQL\16\bin\$nom.exe"
  if (Test-Path -LiteralPath $defaut) { return $defaut }
  throw "$nom introuvable : installer PostgreSQL 16 ou ajouter son dossier bin au PATH."
}

# $BaseForcee : remplace la base de DATABASE_URL (par exemple mawjoud_test), mêmes contrôles.
function Lire-Connexion([string]$BaseForcee) {
  $fichierEnv = Join-Path $script:racineDepot '.env'
  if (-not (Test-Path -LiteralPath $fichierEnv)) { throw "Fichier .env absent à la racine du dépôt." }
  $ligne = Get-Content -LiteralPath $fichierEnv -Encoding UTF8 |
    Where-Object { $_ -match '^\s*DATABASE_URL\s*=' } | Select-Object -First 1
  if (-not $ligne) { throw "DATABASE_URL absente de .env." }
  $texte = ($ligne -replace '^\s*DATABASE_URL\s*=\s*', '').Trim().Trim('"').Trim("'")
  if ($texte -notmatch '^postgres(ql)?://') { throw "DATABASE_URL doit commencer par postgresql:// (valeur non affichée)." }
  try { $u = [Uri]$texte } catch { throw "DATABASE_URL illisible (valeur non affichée)." }

  $infos = $u.UserInfo.Split(':', 2)
  $c = [ordered]@{
    Hote        = $u.Host
    Port        = if ($u.Port -gt 0) { $u.Port } else { 5432 }
    Base        = [Uri]::UnescapeDataString($u.AbsolutePath.TrimStart('/'))
    Utilisateur = [Uri]::UnescapeDataString($infos[0])
    MotDePasse  = if ($infos.Count -gt 1) { [Uri]::UnescapeDataString($infos[1]) } else { $null }
    SslMode     = $null
  }
  foreach ($p in $u.Query.TrimStart('?').Split('&', [StringSplitOptions]::RemoveEmptyEntries)) {
    $kv = $p.Split('=', 2)
    if ($kv[0] -eq 'sslmode') { $c.SslMode = $kv[1] }
    else { throw "Paramètre « $($kv[0]) » de DATABASE_URL non pris en charge." }
  }
  if ($BaseForcee) { $c.Base = $BaseForcee }
  if (-not $c.Base) { throw "DATABASE_URL ne précise pas de base." }
  if ($script:basesInterdites -contains $c.Base.ToLower()) {
    throw "Base « $($c.Base) » interdite : ces scripts ne touchent qu'à la base du projet."
  }
  if ($script:basesAutorisees -notcontains $c.Base) {
    throw "Base « $($c.Base) » inconnue : bases acceptées : $($script:basesAutorisees -join ', ')."
  }
  return $c
}

function Definir-EnvPg($c, [string]$base, [string]$application) {
  $env:PGHOST = $c.Hote; $env:PGPORT = [string]$c.Port; $env:PGUSER = $c.Utilisateur
  $env:PGDATABASE = $base
  if ($c.MotDePasse) { $env:PGPASSWORD = $c.MotDePasse } else { Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue }
  if ($c.SslMode) { $env:PGSSLMODE = $c.SslMode }
  $env:PGCLIENTENCODING = 'UTF8'
  $env:PGAPPNAME = $application
}

function Effacer-EnvPg {
  foreach ($n in 'PGHOST','PGPORT','PGUSER','PGDATABASE','PGPASSWORD','PGSSLMODE','PGCLIENTENCODING','PGAPPNAME') {
    Remove-Item "Env:$n" -ErrorAction SilentlyContinue
  }
}

function Requete([string]$sql) {
  $r = & $script:psql -X -q -A -t -v ON_ERROR_STOP=1 -c $sql
  if ($LASTEXITCODE -ne 0) { throw "Échec de la requête (code $LASTEXITCODE)." }
  # La virgule garde un tableau même pour une seule ligne (sinon PowerShell le déballe en texte).
  return ,@($r | Where-Object { $_ -ne '' })
}
