-- 018 : messages du formulaire Contact. Aucun champ de santé (R13).
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('018', '018_message_contact');

CREATE TABLE prive.message_contact (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid         uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  nom          text        CHECK (length(nom) <= 100),
  email        text        NOT NULL
                 CHECK (length(email) <= 254 AND email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  sujet        text        NOT NULL CHECK (sujet IN ('question', 'erreur_pharmacie', 'pharmacien', 'autre')),
  -- Mêmes limites que le formulaire du front-end.
  message      text        NOT NULL CHECK (length(btrim(message)) BETWEEN 10 AND 2000),
  pharmacie_id bigint      REFERENCES annuaire.pharmacie (id),
  statut       text        NOT NULL DEFAULT 'nouveau' CHECK (statut IN ('nouveau', 'traite')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE prive.message_contact IS 'À traiter côté back-end. Conservation proposée, à valider : 12 mois.';

-- Clé étrangère.
CREATE INDEX message_contact_pharmacie ON prive.message_contact (pharmacie_id) WHERE pharmacie_id IS NOT NULL;
-- Messages à traiter.
CREATE INDEX message_contact_nouveaux  ON prive.message_contact (created_at) WHERE statut = 'nouveau';

CREATE TRIGGER message_contact_maj BEFORE UPDATE ON prive.message_contact
  FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();

COMMIT;
