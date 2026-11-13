-- 026 : valeurs nécessaires aux comptes et à l'authentification (Partie 5, back-end NestJS).
-- - jeton : lien de réinitialisation du mot de passe (usage unique, expire ; empreinte SHA-256 seulement).
-- - envoi_email : e-mails de réinitialisation et « vous avez déjà un compte » (réponse neutre à l'inscription).
-- - journal_audit : connexions réussies et échouées, changements de mot de passe, création d'administrateur.
--   Le journal ne contient jamais de mot de passe, de jeton ni d'adresse IP.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('026', '026_comptes_authentification');

ALTER TABLE prive.jeton DROP CONSTRAINT jeton_type_check;
ALTER TABLE prive.jeton ADD CONSTRAINT jeton_type_check
  CHECK (type IN ('verification_email', 'desabonnement', 'reinitialisation_mot_de_passe'));

ALTER TABLE prive.envoi_email DROP CONSTRAINT envoi_email_type_check;
ALTER TABLE prive.envoi_email ADD CONSTRAINT envoi_email_type_check
  CHECK (type IN ('verification_email', 'alerte', 'reinitialisation_mot_de_passe', 'compte_existant'));

ALTER TABLE prive.journal_audit DROP CONSTRAINT journal_audit_action_check;
ALTER TABLE prive.journal_audit ADD CONSTRAINT journal_audit_action_check CHECK (action IN (
  'valider', 'refuser', 'creer_fiche', 'corriger', 'fermer', 'rouvrir', 'fusionner',
  'retirer_inscription', 'suspendre', 'retablir', 'supprimer_compte',
  'valider_position', 'refuser_position', 'traiter_signalement',
  'connexion_reussie', 'connexion_echouee', 'changer_mot_de_passe', 'reinitialiser_mot_de_passe',
  'creer_administrateur'));

-- Jetons encore valables d'un compte, par type (renvoi d'un lien : les anciens sont annulés).
CREATE INDEX jeton_actifs ON prive.jeton (utilisateur_id, type) WHERE utilise_le IS NULL;

COMMIT;
