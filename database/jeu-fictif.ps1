<#
.SYNOPSIS
  Installe un jeu de données ENTIÈREMENT INVENTÉ pour essayer Mawjoud après un clonage (base vide).

.DESCRIPTION
  - 25 pharmacies fictives (« Pharmacie Fictive 01 » à 25), publiées, dans 12 gouvernorats, positions plausibles,
    téléphones fictifs (+2160000xxxx) et horaires ; 15 médicaments génériques (DCI courantes), marqués donnée de test.
  - Comptes : 1 administrateur, 1 patient, 12 pharmaciens rattachés chacun à une pharmacie (un seul rattachement validé
    par compte), avec des disponibilités variées (« disponible », « quantité limitée », « en rupture », quelques-unes
    « à confirmer »). Mots de passe aléatoires (14 caractères), empreinte argon2id comme l'API, AFFICHÉS UNE SEULE FOIS
    ici : ils ne sont écrits nulle part.
  - Une transaction ; déclencheurs actifs (déclarant vérifié, historique). Refuse de tourner si la base contient déjà
    des fiches qui ne sont pas fictives (données réelles), ou si le jeu est déjà installé.
  - Prérequis : migrations appliquées, et « npm ci » fait dans backend/ (pour argon2). Compte propriétaire de .env
    (DATABASE_URL), mot de passe jamais affiché.

.PARAMETER BaseTest
  Vise mawjoud_test au lieu de mawjoud (essai du script).

.EXAMPLE
  .\database\jeu-fictif.ps1
#>
[CmdletBinding()]
param([switch]$BaseTest)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'connexion-pg.ps1')

$base = if ($BaseTest) { 'mawjoud_test' } else { 'mawjoud' }

# Comptes : rôle, adresse (domaine réservé .test, aucun e-mail réel).
$comptes = @(@('administrateur', 'admin@demo.mawjoud.test'), @('patient', 'patient@demo.mawjoud.test')) +
  @(1..12 | ForEach-Object { , @('pharmacien', ('pharmacien{0:00}@demo.mawjoud.test' -f $_)) })

$SQL = @'
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM annuaire.pharmacie WHERE nom IS NULL OR nom !~ '^Pharmacie Fictive [0-9]{2}$') THEN
    RAISE EXCEPTION 'Cette base contient déjà des fiches qui ne sont pas fictives (données réelles) : jeu fictif refusé.';
  END IF;
  IF EXISTS (SELECT 1 FROM annuaire.pharmacie) OR EXISTS (SELECT 1 FROM prive.utilisateur WHERE email ~ '@demo\.mawjoud\.test$') THEN
    RAISE EXCEPTION 'Le jeu fictif est déjà installé.';
  END IF;
END $$;

-- 15 médicaments génériques (données de test).
INSERT INTO annuaire.medicament (code_source, nom_commercial, dci, forme, dosage, categorie, donnee_test) VALUES
 ('FICT-01', 'Paracétamol', 'paracétamol', 'comprimé', '500 mg', 'antalgique', true),
 ('FICT-02', 'Amoxicilline', 'amoxicilline', 'gélule', '500 mg', 'antibiotique', true),
 ('FICT-03', 'Ibuprofène', 'ibuprofène', 'comprimé', '400 mg', 'anti-inflammatoire', true),
 ('FICT-04', 'Metformine', 'metformine', 'comprimé', '850 mg', 'diabète', true),
 ('FICT-05', 'Amlodipine', 'amlodipine', 'comprimé', '5 mg', 'cardiologie', true),
 ('FICT-06', 'Oméprazole', 'oméprazole', 'gélule', '20 mg', 'digestif', true),
 ('FICT-07', 'Cétirizine', 'cétirizine', 'comprimé', '10 mg', 'allergie', true),
 ('FICT-08', 'Salbutamol', 'salbutamol', 'aérosol doseur', '100 µg', 'asthme', true),
 ('FICT-09', 'Atorvastatine', 'atorvastatine', 'comprimé', '20 mg', 'cardiologie', true),
 ('FICT-10', 'Losartan', 'losartan', 'comprimé', '50 mg', 'cardiologie', true),
 ('FICT-11', 'Diclofénac', 'diclofénac', 'comprimé', '50 mg', 'anti-inflammatoire', true),
 ('FICT-12', 'Azithromycine', 'azithromycine', 'comprimé', '500 mg', 'antibiotique', true),
 ('FICT-13', 'Lévothyroxine', 'lévothyroxine', 'comprimé', '50 µg', 'thyroïde', true),
 ('FICT-14', 'Ambroxol', 'ambroxol', 'sirop', '30 mg/5 ml', 'respiratoire', true),
 ('FICT-15', 'Chlorure de sodium', 'chlorure de sodium', 'collyre', '0,9 %', 'ORL et ophtalmologie', true);

-- 25 pharmacies fictives, publiées (position confirmée, nom relu).
CREATE TEMP TABLE lieux (n int, ville text, gouv int, lat float8, lng float8) ON COMMIT DROP;
INSERT INTO lieux VALUES
 (1,'Tunis',11,36.8065,10.1815),(2,'Tunis',11,36.8190,10.1660),(3,'La Marsa',11,36.8782,10.3247),(4,'Le Bardo',11,36.8092,10.1342),
 (5,'Ariana',12,36.8625,10.1956),(6,'La Soukra',12,36.8740,10.2420),(7,'Ben Arous',13,36.7531,10.2189),(8,'Ezzahra',13,36.7439,10.3083),
 (9,'Nabeul',21,36.4561,10.7376),(10,'Hammamet',21,36.4000,10.6167),(11,'Bizerte',23,37.2744,9.8739),(12,'Menzel Bourguiba',23,37.1536,9.7856),
 (13,'Sousse',51,35.8256,10.6411),(14,'Sousse',51,35.8370,10.6260),(15,'Msaken',51,35.7290,10.5800),(16,'Monastir',52,35.7643,10.8113),
 (17,'Moknine',52,35.6333,10.9000),(18,'Sfax',61,34.7406,10.7603),(19,'Sfax',61,34.7600,10.7400),(20,'Sakiet Ezzit',61,34.8000,10.7700),
 (21,'Kairouan',41,35.6781,10.0963),(22,'Gabès',81,33.8815,10.0982),(23,'Gabès',81,33.8900,10.1100),(24,'Gafsa',71,34.4250,8.7842),
 (25,'Houmt Souk',82,33.8750,10.8575);
CREATE TEMP TABLE fiches ON COMMIT DROP AS SELECT 0 AS n, 0::bigint AS id LIMIT 0;
WITH p AS (
  INSERT INTO annuaire.pharmacie (nom, rue, ville, gouvernorat_code, telephone_principal, latitude, longitude, position_confirmee,
                                  source_gps, precision_gps, statut_publication, nom_a_verifier, garde, sources)
  SELECT format('Pharmacie Fictive %s', lpad(n::text, 2, '0')), format('%s, rue de l''Essai', n), ville, gouv,
         format('+2160000%s', lpad(n::text, 4, '0')), lat, lng, true, 'saisie_admin', 'exact', 'publiee', false,
         CASE WHEN n % 5 = 0 THEN 'nuit' ELSE 'jour' END, '{saisie_admin}'
    FROM lieux ORDER BY n
  RETURNING id, nom)
INSERT INTO fiches SELECT substring(nom FROM '([0-9]{2})$')::int, id FROM p;
INSERT INTO annuaire.horaire (pharmacie_id, jour, ouverture, fermeture)
SELECT f.id, j, o, c FROM fiches f, generate_series(1, 6) j, (VALUES ('08:00'::time, '13:00'::time), ('15:00', '19:30')) h(o, c) WHERE f.n % 7 <> 0;

-- Comptes (empreintes passées par psql, jamais en clair).
CREATE TEMP TABLE empreintes ON COMMIT DROP AS SELECT (ordinality - 1)::int AS i, value AS h FROM jsonb_array_elements_text(:'h'::jsonb) WITH ORDINALITY;
CREATE TEMP TABLE comptes ON COMMIT DROP AS SELECT (ordinality - 1)::int AS i, value->>0 AS role, value->>1 AS email FROM jsonb_array_elements(:'c'::jsonb) WITH ORDINALITY;
INSERT INTO prive.utilisateur (email, mot_de_passe_hache, role, email_verifie_le)
SELECT c.email, e.h, c.role, now() FROM comptes c JOIN empreintes e USING (i) ORDER BY c.i;
-- Pharmaciens 01 à 12 rattachés (validés par l'administrateur) aux pharmacies 1, 3, 5... (réparties sur la carte).
INSERT INTO prive.rattachement_pharmacien (utilisateur_id, pharmacie_id, statut, decide_par, decide_le, justificatif_texte)
SELECT u.id, f.id, 'validee', (SELECT id FROM prive.utilisateur WHERE email = 'admin@demo.mawjoud.test'), now(), 'Jeu fictif.'
  FROM prive.utilisateur u
  JOIN fiches f ON f.n = 2 * substring(u.email FROM 'pharmacien([0-9]{2})@')::int - 1
 WHERE u.email ~ '^pharmacien[0-9]{2}@demo\.mawjoud\.test$';
-- Disponibilités : 6 à 12 médicaments par pharmacie inscrite ; statuts et dates variés (quelques-unes de plus de 24 h).
INSERT INTO annuaire.stock (pharmacie_id, medicament_id, statut, declare_le, declare_par)
SELECT r.pharmacie_id, m.id,
       CASE WHEN random() < 0.6 THEN 'disponible' WHEN random() < 0.6 THEN 'quantite_limitee' ELSE 'en_rupture' END,
       CASE WHEN random() < 0.2 THEN now() - interval '2 days' - random() * interval '2 days' ELSE now() - random() * interval '20 hours' END,
       r.utilisateur_id
  FROM prive.rattachement_pharmacien r
  CROSS JOIN LATERAL (SELECT id FROM annuaire.medicament WHERE code_source LIKE 'FICT-%'
                       ORDER BY md5(id::text || r.id::text) LIMIT 6 + (r.id % 7)) m
 WHERE r.statut = 'validee' AND r.utilisateur_id IN (SELECT id FROM prive.utilisateur WHERE email ~ '@demo\.mawjoud\.test$');
SELECT 'installé : ' || (SELECT count(*) FROM fiches) || ' pharmacies publiées, ' || (SELECT count(*) FROM annuaire.medicament WHERE code_source LIKE 'FICT-%')
       || ' médicaments, ' || (SELECT count(*) FROM comptes) || ' comptes, ' || (SELECT count(*) FROM annuaire.stock) || ' disponibilités';
'@

try {
  [Console]::OutputEncoding = [Text.Encoding]::UTF8
  $script:psql = Trouver-Outil 'psql'
  $c = Lire-Connexion $base
  if ($c.Base -cne $base) { throw 'Garde-fou : base inattendue.' }

  # Mots de passe aléatoires et empreintes argon2id (mêmes réglages que l'API).
  $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'.ToCharArray()
  $alea = [Security.Cryptography.RandomNumberGenerator]::Create()
  $mdp = @(foreach ($x in $comptes) { $o = New-Object byte[] 14; $alea.GetBytes($o); -join ($o | ForEach-Object { $alphabet[$_ % $alphabet.Length] }) })
  $dossierApi = Join-Path $PSScriptRoot '..\backend'
  if (-not (Test-Path (Join-Path $dossierApi 'node_modules\argon2'))) { throw 'Lancer d''abord « npm ci » dans backend/ (argon2 est nécessaire).' }
  $env:MAWJOUD_JEU_MDP = ($mdp | ConvertTo-Json -Compress)
  Push-Location $dossierApi
  try {
    $env:MAWJOUD_JEU_H = node --input-type=module -e "import argon2 from 'argon2'; const h = []; for (const m of JSON.parse(process.env.MAWJOUD_JEU_MDP)) h.push(await argon2.hash(m.normalize('NFC'), { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 })); process.stdout.write(JSON.stringify(h));"
    if ($LASTEXITCODE -ne 0) { throw 'Calcul des empreintes impossible.' }
  } finally { Pop-Location; Remove-Item Env:MAWJOUD_JEU_MDP }
  $env:MAWJOUD_JEU_C = '[' + (($comptes | ForEach-Object { '["{0}","{1}"]' -f $_[0], $_[1] }) -join ',') + ']'

  Definir-EnvPg $c $base 'mawjoud-jeu-fictif'
  try {
    $r = Requete ("\set ON_ERROR_STOP on`n\getenv h MAWJOUD_JEU_H`n\getenv c MAWJOUD_JEU_C`nBEGIN;`n" + $SQL + "`nCOMMIT;`n")
  } finally { Remove-Item Env:MAWJOUD_JEU_H, Env:MAWJOUD_JEU_C -ErrorAction SilentlyContinue }
  Write-Host "Base : $base. $($r | Where-Object { $_ -like 'installé*' })"
  Write-Host ''
  Write-Host 'Comptes de démonstration : notez les mots de passe MAINTENANT, ils ne seront plus jamais affichés.' -ForegroundColor Yellow
  for ($i = 0; $i -lt $comptes.Count; $i++) { Write-Host ('  {0,-15} {1,-34} {2}' -f $comptes[$i][0], $comptes[$i][1], $mdp[$i]) }
  Write-Host ''
  Write-Host 'Les pharmaciens 01 à 12 sont rattachés aux pharmacies fictives 01, 03, 05… 23.'
  $mdp = $null
}
catch {
  Write-Host "ERREUR : $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  Effacer-EnvPg
}
