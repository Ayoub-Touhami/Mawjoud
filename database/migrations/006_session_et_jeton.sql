-- 006 : sessions de connexion et jetons à usage unique (vérification d'e-mail, désabonnement).
-- Seule l'empreinte (SHA-256, 32 octets) est stockée : une fuite de la base ne donne aucun jeton utilisable.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('006', '006_session_et_jeton');

CREATE TABLE prive.session (
  id_hache             bytea       PRIMARY KEY CHECK (length(id_hache) = 32),
  utilisateur_id       bigint      NOT NULL REFERENCES prive.utilisateur (id) ON DELETE CASCADE,
  donnees              jsonb       NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  derniere_activite_le timestamptz NOT NULL DEFAULT now(),
  expire_le            timestamptz NOT NULL,
  CHECK (expire_le > created_at)
);
COMMENT ON TABLE prive.session IS 'Sessions côté serveur ; le cookie HttpOnly porte l''identifiant, la base son empreinte.';
CREATE INDEX session_utilisateur ON prive.session (utilisateur_id);  -- clé étrangère ; fermer toutes les sessions d'un compte suspendu
CREATE INDEX session_expire      ON prive.session (expire_le);       -- purge 30 jours après expiration (proposé, à valider)

CREATE TABLE prive.jeton (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  utilisateur_id bigint      NOT NULL REFERENCES prive.utilisateur (id) ON DELETE CASCADE,
  type           text        NOT NULL CHECK (type IN ('verification_email', 'desabonnement')),
  jeton_hache    bytea       NOT NULL UNIQUE CHECK (length(jeton_hache) = 32),
  expire_le      timestamptz,
  utilise_le     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- Le lien de vérification expire ; le lien de désabonnement fonctionne toujours (F12).
  CHECK (type = 'desabonnement' OR expire_le IS NOT NULL)
);
CREATE INDEX jeton_utilisateur ON prive.jeton (utilisateur_id);  -- clé étrangère
-- Un seul lien de désabonnement par compte, repris dans chaque e-mail.
CREATE UNIQUE INDEX jeton_desabonnement_unique ON prive.jeton (utilisateur_id) WHERE type = 'desabonnement';

COMMIT;
