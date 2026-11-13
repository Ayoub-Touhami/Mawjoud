-- 033 : demandes de position en ajout seul, statut « remplacee », actions du journal (Partie 8).
--
-- - Une nouvelle demande d'un pharmacien remplace sa demande en attente : l'ancienne passe à
--   « remplacee » et reste conservée (une seule demande en attente par pharmacie, index de 011).
-- - Une demande ne se supprime jamais et ne se modifie plus : seule sa décision s'enregistre, une fois
--   (en_attente → validee, refusee ou remplacee, avec motif, décideur, date). Exception : la suppression
--   d'un compte met demandeur_id ou decide_par à vide (ON DELETE SET NULL), la demande reste.
-- - Droits : plus de DELETE pour l'application ; UPDATE limité aux colonnes de la décision.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('033', '033_demandes_position');

ALTER TABLE prive.demande_position DROP CONSTRAINT demande_position_statut_check;
ALTER TABLE prive.demande_position ADD CONSTRAINT demande_position_statut_check
  CHECK (statut IN ('en_attente', 'validee', 'refusee', 'remplacee'));

CREATE FUNCTION prive.figer_demande_position() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  decision CONSTANT text[] := ARRAY['statut', 'motif_refus', 'decide_par', 'decide_le', 'updated_at'];
  comptes  CONSTANT text[] := ARRAY['demandeur_id', 'decide_par', 'updated_at'];
BEGIN
  -- Compte supprimé : seules les références au compte passent à vide.
  IF (to_jsonb(NEW) - comptes) = (to_jsonb(OLD) - comptes)
     AND (NEW.demandeur_id IS NOT DISTINCT FROM OLD.demandeur_id OR NEW.demandeur_id IS NULL)
     AND (NEW.decide_par IS NOT DISTINCT FROM OLD.decide_par OR NEW.decide_par IS NULL) THEN
    RETURN NEW;
  END IF;
  IF OLD.statut <> 'en_attente' OR NEW.statut = 'en_attente' OR (to_jsonb(NEW) - decision) <> (to_jsonb(OLD) - decision) THEN
    RAISE EXCEPTION 'Une demande de position ne se modifie pas : seule sa décision s''enregistre, une fois.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER demande_position_figee BEFORE UPDATE ON prive.demande_position
  FOR EACH ROW EXECUTE FUNCTION prive.figer_demande_position();
CREATE TRIGGER demande_position_sans_suppression BEFORE DELETE ON prive.demande_position
  FOR EACH ROW EXECUTE FUNCTION public.interdire_modification();
CREATE TRIGGER demande_position_sans_vidage BEFORE TRUNCATE ON prive.demande_position
  FOR EACH STATEMENT EXECUTE FUNCTION public.interdire_modification();

REVOKE UPDATE, DELETE ON prive.demande_position FROM mawjoud_application;
GRANT UPDATE (statut, motif_refus, decide_par, decide_le) ON prive.demande_position TO mawjoud_application;

ALTER TABLE prive.journal_audit DROP CONSTRAINT journal_audit_action_check;
ALTER TABLE prive.journal_audit ADD CONSTRAINT journal_audit_action_check CHECK (action IN (
  'valider', 'refuser', 'creer_fiche', 'corriger', 'fermer', 'rouvrir', 'fusionner',
  'retirer_inscription', 'suspendre', 'retablir', 'supprimer_compte',
  'valider_position', 'refuser_position', 'traiter_signalement',
  'connexion_reussie', 'connexion_echouee', 'changer_mot_de_passe', 'reinitialiser_mot_de_passe',
  'creer_administrateur',
  'modifier_fiche', 'retirer_declaration', 'acces_refuse',
  'proposer_position', 'relire_nom', 'changer_statut'));

COMMIT;
