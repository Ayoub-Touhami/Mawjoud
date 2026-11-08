-- 016 : file des e-mails à envoyer (vérification d'adresse, alertes).
-- R11 : un seul e-mail par alerte, garanti par un index unique ; un échec est retenté sans doublon.
-- L'adresse n'est pas recopiée : elle est lue dans prive.utilisateur au moment de l'envoi.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('016', '016_envoi_email');

CREATE TABLE prive.envoi_email (
  id                     bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type                   text        NOT NULL CHECK (type IN ('verification_email', 'alerte')),
  utilisateur_id         bigint      NOT NULL REFERENCES prive.utilisateur (id) ON DELETE CASCADE,
  alerte_id              bigint      REFERENCES prive.alerte (id) ON DELETE CASCADE,
  pharmacie_id           bigint      REFERENCES annuaire.pharmacie (id),
  statut                 text        NOT NULL DEFAULT 'a_envoyer' CHECK (statut IN ('a_envoyer', 'envoye', 'abandonne')),
  tentatives             smallint    NOT NULL DEFAULT 0 CHECK (tentatives >= 0),
  prochaine_tentative_le timestamptz NOT NULL DEFAULT now(),
  derniere_erreur        text,
  envoye_le              timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (type <> 'alerte' OR (alerte_id IS NOT NULL AND pharmacie_id IS NOT NULL)),
  CHECK ((statut = 'envoye') = (envoye_le IS NOT NULL))
);
COMMENT ON TABLE prive.envoi_email IS 'File d''envoi : le back-end prend les lignes « a_envoyer » dont l''heure est venue.';

-- R11 : une alerte ne produit qu'un e-mail.
CREATE UNIQUE INDEX envoi_email_une_alerte ON prive.envoi_email (alerte_id) WHERE type = 'alerte';
-- Lecture de la file.
CREATE INDEX envoi_email_a_traiter ON prive.envoi_email (prochaine_tentative_le) WHERE statut = 'a_envoyer';
-- Clés étrangères.
CREATE INDEX envoi_email_utilisateur ON prive.envoi_email (utilisateur_id);
CREATE INDEX envoi_email_pharmacie   ON prive.envoi_email (pharmacie_id) WHERE pharmacie_id IS NOT NULL;

CREATE TRIGGER envoi_email_maj BEFORE UPDATE ON prive.envoi_email
  FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();

COMMIT;
