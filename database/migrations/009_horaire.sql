-- 009 : horaires structurés, au format du front-end (0 = dimanche … 6 = samedi).
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('009', '009_horaire');

CREATE TABLE annuaire.horaire (
  id           bigint   GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pharmacie_id bigint   NOT NULL REFERENCES annuaire.pharmacie (id) ON DELETE CASCADE,
  jour         smallint NOT NULL CHECK (jour BETWEEN 0 AND 6),
  ouverture    time     NOT NULL,
  fermeture    time     NOT NULL,
  -- Une fermeture avant l'ouverture veut dire « le lendemain » (garde de nuit).
  CHECK (fermeture <> ouverture),
  -- Couvre aussi la clé étrangère (première colonne).
  UNIQUE (pharmacie_id, jour, ouverture)
);
COMMENT ON TABLE annuaire.horaire IS 'Plages d''ouverture ; plusieurs plages possibles le même jour.';

COMMIT;
