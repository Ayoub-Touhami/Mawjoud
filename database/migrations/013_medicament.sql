-- 013 : catalogue des médicaments.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('013', '013_medicament');

CREATE TABLE annuaire.medicament (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid           uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  code_source    text        UNIQUE,
  nom_commercial text        NOT NULL CHECK (nom_commercial <> ''),
  dci            text        NOT NULL CHECK (dci <> ''),
  forme          text,
  dosage         text,
  categorie      text,
  nom_ar         text,
  dci_ar         text,
  donnee_test    boolean     NOT NULL DEFAULT false,
  actif          boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE annuaire.medicament IS 'Catalogue. Source officielle à brancher (nomenclature DPM) ; 40 lignes de test en attendant.';
COMMENT ON COLUMN annuaire.medicament.actif IS 'Faux : retiré du catalogue, sans supprimer les alertes et l''historique.';

-- Pas deux fois le même produit (nom, dosage, forme), sans tenir compte des accents ni de la casse.
CREATE UNIQUE INDEX medicament_unique ON annuaire.medicament
  (public.normaliser(nom_commercial), public.normaliser(coalesce(dosage, '')), public.normaliser(coalesce(forme, '')));
-- Recherche tolérante aux fautes par nom commercial et par substance active (F2).
CREATE INDEX medicament_nom_trgm ON annuaire.medicament USING gin (public.normaliser(nom_commercial) public.gin_trgm_ops);
CREATE INDEX medicament_dci_trgm ON annuaire.medicament USING gin (public.normaliser(dci) public.gin_trgm_ops);

CREATE TRIGGER medicament_maj BEFORE UPDATE ON annuaire.medicament
  FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();

COMMIT;
