-- 017 : signalement d'une erreur sur une fiche de pharmacie.
-- Jamais sur un stock : la spécification écarte le signalement de stock par les patients (13.3).
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('017', '017_signalement');

CREATE TABLE prive.signalement (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid         uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  pharmacie_id bigint      NOT NULL REFERENCES annuaire.pharmacie (id),
  -- Facultatif : un visiteur sans compte peut signaler.
  auteur_id    bigint      REFERENCES prive.utilisateur (id) ON DELETE SET NULL,
  type         text        NOT NULL CHECK (type IN ('adresse', 'telephone', 'position', 'horaires', 'fermeture', 'autre')),
  texte        text        NOT NULL CHECK (length(btrim(texte)) BETWEEN 10 AND 2000),
  statut       text        NOT NULL DEFAULT 'nouveau' CHECK (statut IN ('nouveau', 'traite', 'rejete')),
  traite_par   bigint      REFERENCES prive.utilisateur (id) ON DELETE SET NULL,
  traite_le    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((statut = 'nouveau') = (traite_le IS NULL))
);

-- Clés étrangères.
CREATE INDEX signalement_pharmacie  ON prive.signalement (pharmacie_id);
CREATE INDEX signalement_auteur     ON prive.signalement (auteur_id);
CREATE INDEX signalement_traite_par ON prive.signalement (traite_par);
-- File de l'administration.
CREATE INDEX signalement_nouveaux   ON prive.signalement (created_at) WHERE statut = 'nouveau';

CREATE FUNCTION prive.verifier_signalement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM prive.exiger_role(NEW.traite_par, 'administrateur');
  RETURN NEW;
END;
$$;
CREATE TRIGGER signalement_role BEFORE INSERT OR UPDATE OF traite_par ON prive.signalement
  FOR EACH ROW EXECUTE FUNCTION prive.verifier_signalement();
CREATE TRIGGER signalement_maj BEFORE UPDATE ON prive.signalement
  FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();

COMMIT;
