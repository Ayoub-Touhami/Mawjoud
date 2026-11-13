-- Import du catalogue de référence (medicaments_200.csv, R001 à R200) dans annuaire.medicament.
-- Rejouable : une ligne déjà présente (même code_source, ou même nom, dosage et forme) n'est pas ajoutée.
-- Une seule transaction : au moindre contrôle en échec, rien n'est écrit.
-- Ce catalogue n'est PAS la nomenclature officielle : à faire relire par un pharmacien avant publication.
-- Variable fournie par database/importer-medicaments-reference.ps1 : f_catalogue.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;

CREATE TEMP TABLE ch_catalogue (
  id text, nom text, dci text, forme text, dosage text, categorie text, donnee_test text
) ON COMMIT DROP;
\set cmd '\\copy ch_catalogue FROM ' :'f_catalogue' ' WITH (FORMAT csv, HEADER true, ENCODING ''UTF8'')'
:cmd

-- Contrôles bloquants (les mêmes que controler_catalogue.py, refaits ici sur ce qui est réellement lu).
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM ch_catalogue;
  IF n <> 200 THEN RAISE EXCEPTION 'Catalogue : % lignes lues, 200 attendues.', n; END IF;
  SELECT count(*) INTO n FROM ch_catalogue WHERE id !~ '^R[0-9]{3}$';
  IF n > 0 THEN RAISE EXCEPTION '% identifiant(s) hors du format R000.', n; END IF;
  SELECT count(*) - count(DISTINCT id) INTO n FROM ch_catalogue;
  IF n > 0 THEN RAISE EXCEPTION '% identifiant(s) en double.', n; END IF;
  SELECT count(*) INTO n FROM ch_catalogue WHERE donnee_test IS DISTINCT FROM 'non';
  IF n > 0 THEN RAISE EXCEPTION '% ligne(s) avec donnee_test différent de « non ».', n; END IF;
  SELECT count(*) INTO n FROM ch_catalogue
   WHERE coalesce(nom, '') = '' OR coalesce(dci, '') = '' OR coalesce(forme, '') = '' OR coalesce(dosage, '') = '' OR coalesce(categorie, '') = '';
  IF n > 0 THEN RAISE EXCEPTION '% ligne(s) avec un champ vide.', n; END IF;
  SELECT count(*) INTO n FROM ch_catalogue WHERE nom <> upper(left(dci, 1)) || substr(dci, 2);
  IF n > 0 THEN RAISE EXCEPTION '% ligne(s) dont le nom n''est pas la DCI (marque ?).', n; END IF;
  SELECT count(*) - count(DISTINCT (public.normaliser(dci), public.normaliser(forme), public.normaliser(dosage))) INTO n FROM ch_catalogue;
  IF n > 0 THEN RAISE EXCEPTION '% doublon(s) : même DCI, même forme, même dosage.', n; END IF;
  -- Un code déjà présent doit décrire le même médicament (sinon : fichier modifié depuis le premier import).
  SELECT count(*) INTO n FROM ch_catalogue c JOIN annuaire.medicament m ON m.code_source = c.id
   WHERE (m.nom_commercial, m.dci, m.forme, m.dosage, m.categorie, m.donnee_test)
         IS DISTINCT FROM (c.nom, c.dci, c.forme, c.dosage, c.categorie, false);
  IF n > 0 THEN RAISE EXCEPTION '% code(s) déjà en base avec un contenu différent : import refusé.', n; END IF;
END $$;

CREATE TEMP TABLE avant ON COMMIT DROP AS
  SELECT (SELECT count(*) FROM annuaire.medicament WHERE code_source ~ '^R[0-9]{3}$') AS reference,
         (SELECT count(*) FROM annuaire.medicament WHERE donnee_test) AS test;

INSERT INTO annuaire.medicament (code_source, nom_commercial, dci, forme, dosage, categorie, donnee_test)
SELECT id, nom, dci, forme, dosage, categorie, false FROM ch_catalogue ORDER BY id
ON CONFLICT DO NOTHING;

-- Vérifications après écriture.
DO $$
DECLARE r bigint; t bigint; s bigint;
BEGIN
  SELECT count(*) INTO r FROM annuaire.medicament WHERE code_source ~ '^R[0-9]{3}$' AND NOT donnee_test AND actif;
  IF r <> 200 THEN RAISE EXCEPTION 'Après import : % médicaments R, 200 attendus (conflit avec un médicament existant ?).', r; END IF;
  SELECT count(*) INTO t FROM annuaire.medicament WHERE donnee_test;
  IF t <> (SELECT test FROM avant) THEN RAISE EXCEPTION 'Les médicaments de test ont changé (% au lieu de %).', t, (SELECT test FROM avant); END IF;
  SELECT count(*) INTO s FROM annuaire.stock st JOIN annuaire.medicament m ON m.id = st.medicament_id WHERE m.code_source ~ '^R[0-9]{3}$';
  IF s > 0 THEN RAISE EXCEPTION '% disponibilité(s) existent pour le catalogue de référence.', s; END IF;
END $$;

SELECT 'Catalogue de référence : ' || (SELECT count(*) FROM annuaire.medicament WHERE code_source ~ '^R[0-9]{3}$') - (SELECT reference FROM avant)
    || ' ajouté(s), ' || (SELECT count(*) FROM annuaire.medicament WHERE code_source ~ '^R[0-9]{3}$') || ' au total ; '
    || (SELECT count(*) FROM annuaire.medicament WHERE donnee_test) || ' médicaments de test conservés ; '
    || (SELECT count(*) FROM annuaire.stock st JOIN annuaire.medicament m ON m.id = st.medicament_id WHERE m.code_source ~ '^R[0-9]{3}$')
    || ' disponibilité pour le catalogue ; ' || (SELECT count(*) FROM annuaire.medicament) || ' médicaments en tout.' AS bilan;

COMMIT;
