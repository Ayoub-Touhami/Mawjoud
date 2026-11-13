-- Import initial des CSV dans la base mawjoud, en une seule transaction.
-- À lancer par database/importer-donnees.ps1, qui fournit les chemins :
--   f_final, f_attente, f_interne, f_medicaments.
-- Règles de conversion : docs/MODELE_DONNEES.md, section « Correspondance des CSV ».
-- N'affiche aucune ligne de données : seulement des comptes.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;

-- 0. Pas de double import.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM annuaire.pharmacie) OR EXISTS (SELECT 1 FROM annuaire.medicament) THEN
    RAISE EXCEPTION 'La base contient déjà des pharmacies ou des médicaments : import refusé.';
  END IF;
END $$;

SET LOCAL mawjoud.motif_position = 'import initial des CSV';

-- 1. Chargement brut (tout en texte), tables effacées à la fin de la transaction.
CREATE TEMP TABLE ch_final (
  id text, nom text, rue text, quartier text, ville text, code_postal text, gouvernorat text,
  gouvernorat_code text, telephone_principal text, telephones_autres text, latitude text, longitude text,
  source_gps text, precision_gps text, garde_jour_nuit text, horaires text, a_verifier text,
  nb_sources text, sources text
) ON COMMIT DROP;
CREATE TEMP TABLE ch_attente (
  id text, nom text, rue text, quartier text, ville text, code_postal text, gouvernorat text,
  gouvernorat_code text, telephone_principal text, telephones_autres text, latitude text, longitude text,
  source_gps text, precision_gps text, garde_jour_nuit text, horaires text, publiable text, a_verifier text,
  nb_sources text, sources text
) ON COMMIT DROP;
CREATE TEMP TABLE ch_interne (
  id text, nom_est_nom_de_personne text, pharmacien_interne text, ids_sources text, osm_id text,
  a_verifier_motifs text, motif_non_publiable text, origine_nom text, origine_adresse text,
  origine_telephone text, origine_gps text, origine_garde text, origine_horaires text
) ON COMMIT DROP;
CREATE TEMP TABLE ch_medicaments (
  id text, nom text, dci text, forme text, dosage text, categorie text, donnee_test text
) ON COMMIT DROP;

-- \copy n'interprète pas les variables : la commande est composée puis exécutée.
\set cmd '\\copy ch_final FROM ' :'f_final' ' WITH (FORMAT csv, HEADER true, ENCODING ''UTF8'')'
:cmd
\set cmd '\\copy ch_attente FROM ' :'f_attente' ' WITH (FORMAT csv, HEADER true, ENCODING ''UTF8'')'
:cmd
\set cmd '\\copy ch_interne FROM ' :'f_interne' ' WITH (FORMAT csv, HEADER true, ENCODING ''UTF8'')'
:cmd
\set cmd '\\copy ch_medicaments FROM ' :'f_medicaments' ' WITH (FORMAT csv, HEADER true, ENCODING ''UTF8'')'
:cmd

-- 2. Contrôles bloquants avant toute écriture.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM ch_final f JOIN ch_attente a USING (id);
  IF n > 0 THEN RAISE EXCEPTION '% identifiant(s) présents à la fois dans le fichier final et en attente.', n; END IF;

  SELECT count(*) INTO n FROM ch_interne i WHERE NOT EXISTS (SELECT 1 FROM ch_final f WHERE f.id = i.id);
  IF n > 0 THEN RAISE EXCEPTION '% ligne(s) de pharmacies_interne.csv sans pharmacie dans le fichier final.', n; END IF;

  -- Nom de gouvernorat cohérent avec son code (le nom n'est pas stocké).
  SELECT count(*) INTO n FROM (SELECT gouvernorat, gouvernorat_code FROM ch_final
                               UNION ALL SELECT gouvernorat, gouvernorat_code FROM ch_attente) x
  WHERE coalesce(x.gouvernorat_code, '') <> ''
    AND NOT EXISTS (SELECT 1 FROM annuaire.gouvernorat g
                    WHERE g.code = x.gouvernorat_code::smallint AND g.nom = x.gouvernorat);
  IF n > 0 THEN RAISE EXCEPTION '% ligne(s) avec un nom de gouvernorat différent de celui de son code.', n; END IF;

  SELECT count(*) INTO n FROM (SELECT a_verifier AS v FROM ch_final UNION ALL SELECT a_verifier FROM ch_attente
                               UNION ALL SELECT publiable FROM ch_attente
                               UNION ALL SELECT nom_est_nom_de_personne FROM ch_interne) x
  WHERE v IS NULL OR v NOT IN ('true', 'false');
  IF n > 0 THEN RAISE EXCEPTION '% valeur(s) booléenne(s) autres que true ou false.', n; END IF;

  SELECT count(*) INTO n FROM ch_medicaments WHERE donnee_test IS NULL OR donnee_test NOT IN ('oui', 'non');
  IF n > 0 THEN RAISE EXCEPTION '% médicament(s) avec donnee_test autre que oui ou non.', n; END IF;

  SELECT count(*) INTO n FROM ch_final f, unnest(string_to_array(nullif(f.horaires, ''), ' ; ')) AS s(plage)
  WHERE s.plage !~ '^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) [0-2][0-9]:[0-5][0-9]-[0-2][0-9]:[0-5][0-9]$';
  IF n > 0 THEN RAISE EXCEPTION '% plage(s) horaire(s) illisible(s).', n; END IF;
  SELECT count(*) INTO n FROM ch_attente WHERE coalesce(horaires, '') <> '';
  IF n > 0 THEN RAISE EXCEPTION '% pharmacie(s) en attente avec horaires : cas non prévu.', n; END IF;
END $$;

-- 3. Pharmacies du fichier final : position confirmée.
--    Nom de personne → a_relire ; sinon → pret_a_publier (migration 022). Rien n'est « publiee ».
INSERT INTO annuaire.pharmacie (
  id_source, nom, rue, quartier, ville, code_postal, gouvernorat_code, telephone_principal, telephones_autres,
  latitude, longitude, position_confirmee, source_gps, precision_gps, garde, horaires_texte,
  statut_publication, a_verifier, nom_a_verifier, sources)
SELECT f.id, nullif(f.nom, ''), nullif(f.rue, ''), nullif(f.quartier, ''), nullif(f.ville, ''),
       nullif(f.code_postal, ''), nullif(f.gouvernorat_code, '')::smallint, nullif(f.telephone_principal, ''),
       coalesce(string_to_array(nullif(f.telephones_autres, ''), ' | '), '{}'),
       nullif(f.latitude, '')::double precision, nullif(f.longitude, '')::double precision, true,
       nullif(f.source_gps, ''), f.precision_gps, nullif(f.garde_jour_nuit, ''), nullif(f.horaires, ''),
       CASE WHEN i.nom_est_nom_de_personne = 'true' THEN 'a_relire' ELSE 'pret_a_publier' END,
       f.a_verifier::boolean, coalesce(i.nom_est_nom_de_personne, 'false')::boolean,
       coalesce(string_to_array(nullif(f.sources, ''), ' | '), '{}')
FROM ch_final f LEFT JOIN ch_interne i USING (id)
ORDER BY f.id;

-- 4. Pharmacies en attente : position jamais confirmée.
INSERT INTO annuaire.pharmacie (
  id_source, nom, rue, quartier, ville, code_postal, gouvernorat_code, telephone_principal, telephones_autres,
  latitude, longitude, position_confirmee, source_gps, precision_gps, garde, horaires_texte,
  statut_publication, a_verifier, sources)
SELECT a.id, nullif(a.nom, ''), nullif(a.rue, ''), nullif(a.quartier, ''), nullif(a.ville, ''),
       nullif(a.code_postal, ''), nullif(a.gouvernorat_code, '')::smallint, nullif(a.telephone_principal, ''),
       coalesce(string_to_array(nullif(a.telephones_autres, ''), ' | '), '{}'),
       nullif(a.latitude, '')::double precision, nullif(a.longitude, '')::double precision, false,
       nullif(a.source_gps, ''), a.precision_gps, nullif(a.garde_jour_nuit, ''), NULL,
       CASE a.publiable WHEN 'true' THEN 'en_attente_position' ELSE 'non_publiable' END,
       a.a_verifier::boolean,
       coalesce(string_to_array(nullif(a.sources, ''), ' | '), '{}')
FROM ch_attente a
ORDER BY a.id;

-- 5. Traçabilité interne (fichier final seulement).
INSERT INTO prive.pharmacie_interne (
  pharmacie_id, nom_est_nom_de_personne, pharmacien_nom, ids_sources, osm_id, motifs_a_verifier,
  motif_non_publiable, origine_nom, origine_adresse, origine_telephone, origine_gps, origine_garde, origine_horaires)
SELECT p.id, i.nom_est_nom_de_personne::boolean, nullif(i.pharmacien_interne, ''),
       coalesce(string_to_array(nullif(i.ids_sources, ''), ' | '), '{}'), nullif(i.osm_id, ''),
       coalesce(string_to_array(nullif(i.a_verifier_motifs, ''), ' ; '), '{}'), nullif(i.motif_non_publiable, ''),
       nullif(i.origine_nom, ''), nullif(i.origine_adresse, ''), nullif(i.origine_telephone, ''),
       nullif(i.origine_gps, ''), nullif(i.origine_garde, ''), nullif(i.origine_horaires, '')
FROM ch_interne i JOIN annuaire.pharmacie p ON p.id_source = i.id;

-- 6. Horaires structurés : Monday…Saturday → 1…6, Sunday → 0 (comme le front-end).
INSERT INTO annuaire.horaire (pharmacie_id, jour, ouverture, fermeture)
SELECT p.id,
       array_position(ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'], m[1]) - 1,
       m[2]::time, m[3]::time
FROM annuaire.pharmacie p
CROSS JOIN LATERAL unnest(string_to_array(p.horaires_texte, ' ; ')) AS s(plage)
CROSS JOIN LATERAL regexp_match(s.plage, '^(\w+) ([0-9:]+)-([0-9:]+)$') AS m
WHERE p.horaires_texte IS NOT NULL;

-- 7. Médicaments de test.
INSERT INTO annuaire.medicament (code_source, nom_commercial, dci, forme, dosage, categorie, donnee_test)
SELECT id, nom, dci, nullif(forme, ''), nullif(dosage, ''), nullif(categorie, ''), donnee_test = 'oui'
FROM ch_medicaments ORDER BY id;

SELECT 'Lignes lues : final ' || (SELECT count(*) FROM ch_final) || ', en attente ' || (SELECT count(*) FROM ch_attente)
    || ', interne ' || (SELECT count(*) FROM ch_interne) || ', médicaments ' || (SELECT count(*) FROM ch_medicaments) || '.';

COMMIT;
