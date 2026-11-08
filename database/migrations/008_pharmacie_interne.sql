-- 008 : traçabilité interne des pharmacies (noms de pharmaciens, sources, motifs). Jamais publique.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('008', '008_pharmacie_interne');

CREATE TABLE prive.pharmacie_interne (
  pharmacie_id            bigint      PRIMARY KEY REFERENCES annuaire.pharmacie (id),
  nom_est_nom_de_personne boolean     NOT NULL DEFAULT false,
  pharmacien_nom          text,
  ids_sources             text[]      NOT NULL DEFAULT '{}',
  osm_id                  text        CHECK (osm_id ~ '^[nwr][0-9]+$'),
  motifs_a_verifier       text[]      NOT NULL DEFAULT '{}',
  motif_non_publiable     text,
  origine_nom             text,
  origine_adresse         text,
  origine_telephone       text,
  origine_gps             text,
  origine_garde           text,
  origine_horaires        text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE prive.pharmacie_interne IS
  'Une ligne par pharmacie issue des CSV. Contient des noms de personnes : aucune vue publique n''y accède.';

CREATE TRIGGER pharmacie_interne_maj BEFORE UPDATE ON prive.pharmacie_interne
  FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();

COMMIT;
