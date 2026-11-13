-- 034 : alertes des patients, rappels aux pharmacies, suivi d'un médicament par le pharmacien (Partie 9b).
--
-- 1. prive.alerte : consentement explicite daté (obligatoire). Une alerte se supprime (par le patient, par
--    le lien de désinscription, ou par la purge 30 jours après son déclenchement) : aucune donnée de santé
--    gardée plus que nécessaire.
-- 2. prive.jeton : un lien de désinscription par e-mail d'alerte (empreinte seulement). L'index « un seul
--    par compte » (006) est retiré : un jeton n'est connu en clair qu'à sa création, il en faut un par e-mail.
--    Chaque lien reste valable tant que le compte existe (F12 : le lien fonctionne toujours).
-- 3. prive.envoi_email : type « rappel_mise_a_jour » (pharmacie sans mise à jour depuis N jours).
-- 4. annuaire.stock : un médicament suivi sans statut (statut vide) ne s'ajoute que par le pharmacien
--    rattaché de la pharmacie (ou un administrateur) ; le déclarant d'un statut était déjà vérifié (014).
-- 5. Journal : « confirmer_tout ». Les alertes ne sont jamais journalisées (médicament = donnée de santé).
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('034', '034_alertes_et_rappels');

-- 1.
ALTER TABLE prive.alerte ADD COLUMN consentement_le timestamptz NOT NULL;
COMMENT ON COLUMN prive.alerte.consentement_le IS
  'Date du consentement explicite à recevoir un e-mail pour ce médicament (obligatoire). Migration 034.';

-- 2.
DROP INDEX prive.jeton_desabonnement_unique;
CREATE INDEX jeton_desabonnement ON prive.jeton (utilisateur_id) WHERE type = 'desabonnement';

-- 3.
ALTER TABLE prive.envoi_email DROP CONSTRAINT envoi_email_type_check;
ALTER TABLE prive.envoi_email ADD CONSTRAINT envoi_email_type_check
  CHECK (type IN ('verification_email', 'alerte', 'reinitialisation_mot_de_passe', 'compte_existant', 'rappel_mise_a_jour'));
ALTER TABLE prive.envoi_email ADD CONSTRAINT envoi_email_rappel_pharmacie
  CHECK (type <> 'rappel_mise_a_jour' OR pharmacie_id IS NOT NULL);
-- Dernier rappel d'une pharmacie (au plus un par période).
CREATE INDEX envoi_email_rappels ON prive.envoi_email (pharmacie_id, created_at DESC) WHERE type = 'rappel_mise_a_jour';

-- 4.
CREATE FUNCTION annuaire.verifier_suivi() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  u record;
BEGIN
  IF NEW.statut IS NOT NULL OR NOT annuaire.est_application() THEN
    RETURN NEW;  -- statut déclaré : verifier_declarant (014) s'en charge
  END IF;
  SELECT * INTO u FROM annuaire.acteur_actif();
  IF u.role = 'administrateur' OR (u.role = 'pharmacien' AND annuaire.pharmacien_de(u.id, NEW.pharmacie_id)) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Seul le pharmacien de cette pharmacie suit un médicament (R9).' USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER stock_suivi BEFORE INSERT ON annuaire.stock
  FOR EACH ROW EXECUTE FUNCTION annuaire.verifier_suivi();

-- 5.
ALTER TABLE prive.journal_audit DROP CONSTRAINT journal_audit_action_check;
ALTER TABLE prive.journal_audit ADD CONSTRAINT journal_audit_action_check CHECK (action IN (
  'valider', 'refuser', 'creer_fiche', 'corriger', 'fermer', 'rouvrir', 'fusionner',
  'retirer_inscription', 'suspendre', 'retablir', 'supprimer_compte',
  'valider_position', 'refuser_position', 'traiter_signalement',
  'connexion_reussie', 'connexion_echouee', 'changer_mot_de_passe', 'reinitialiser_mot_de_passe',
  'creer_administrateur',
  'modifier_fiche', 'retirer_declaration', 'acces_refuse',
  'proposer_position', 'relire_nom', 'changer_statut',
  'confirmer_tout'));

COMMIT;
