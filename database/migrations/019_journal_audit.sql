-- 019 : journal d'audit (qui a fait quoi, quand). On y ajoute, on n'y modifie rien.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('019', '019_journal_audit');

CREATE TABLE prive.journal_audit (
  id         bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Sans clé étrangère : le journal reste intact quand un compte est supprimé.
  acteur_id  bigint,
  action     text        NOT NULL CHECK (action IN (
                 'valider', 'refuser', 'creer_fiche', 'corriger', 'fermer', 'rouvrir', 'fusionner',
                 'retirer_inscription', 'suspendre', 'retablir', 'supprimer_compte',
                 'valider_position', 'refuser_position', 'traiter_signalement')),
  cible_type text        NOT NULL CHECK (cible_type IN ('pharmacie', 'rattachement', 'demande_position',
                                                        'utilisateur', 'signalement', 'message_contact')),
  cible_id   text        NOT NULL,
  detail     jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Journal du plus récent au plus ancien.
CREATE INDEX journal_audit_date   ON prive.journal_audit (created_at DESC);
-- Actions d'un administrateur.
CREATE INDEX journal_audit_acteur ON prive.journal_audit (acteur_id);
-- Historique d'un objet.
CREATE INDEX journal_audit_cible  ON prive.journal_audit (cible_type, cible_id);

CREATE TRIGGER journal_audit_fige BEFORE UPDATE OR DELETE ON prive.journal_audit
  FOR EACH ROW EXECUTE FUNCTION public.interdire_modification();
CREATE TRIGGER journal_audit_fige_vidage BEFORE TRUNCATE ON prive.journal_audit
  FOR EACH STATEMENT EXECUTE FUNCTION public.interdire_modification();

COMMIT;
