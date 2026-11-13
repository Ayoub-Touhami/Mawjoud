-- 031 : espace pharmacien (Partie 7). (028 reste réservée à R9 sur prive.demande_position, Partie 8.)
--
-- 1. Retrait d'une déclaration de stock (DELETE) : la base vérifie l'acteur, comme elle vérifie déjà le
--    déclarant à l'écriture (014, verifier_declarant). L'application indique l'acteur dans la transaction :
--      SELECT set_config('mawjoud.acteur_id', '<id du compte>', true);
--    Autorisé : le pharmacien rattaché (validé, non suspendu) de CETTE pharmacie, ou un administrateur non
--    suspendu. Sans acteur, ou un autre compte : refusé. L'historique (historique_stock) n'est pas touché.
-- 2. Journal : modification de la fiche par le pharmacien, retrait d'une déclaration, accès refusé (R9).
-- Aucun droit nouveau : mawjoud_application a déjà ce qu'il faut (021).
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('031', '031_espace_pharmacien');

CREATE FUNCTION annuaire.verifier_retrait_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  acteur bigint := nullif(current_setting('mawjoud.acteur_id', true), '')::bigint;
BEGIN
  IF acteur IS NULL OR NOT EXISTS (
    SELECT 1 FROM prive.utilisateur u
     WHERE u.id = acteur AND NOT u.suspendu
       AND (u.role = 'administrateur'
            OR EXISTS (SELECT 1 FROM prive.rattachement_pharmacien r
                        WHERE r.utilisateur_id = u.id AND r.pharmacie_id = OLD.pharmacie_id AND r.statut = 'validee'))
  ) THEN
    RAISE EXCEPTION 'Seul le pharmacien vérifié de cette pharmacie (ou un administrateur) retire une déclaration (R9).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER stock_retrait BEFORE DELETE ON annuaire.stock
  FOR EACH ROW EXECUTE FUNCTION annuaire.verifier_retrait_stock();

ALTER TABLE prive.journal_audit DROP CONSTRAINT journal_audit_action_check;
ALTER TABLE prive.journal_audit ADD CONSTRAINT journal_audit_action_check CHECK (action IN (
  'valider', 'refuser', 'creer_fiche', 'corriger', 'fermer', 'rouvrir', 'fusionner',
  'retirer_inscription', 'suspendre', 'retablir', 'supprimer_compte',
  'valider_position', 'refuser_position', 'traiter_signalement',
  'connexion_reussie', 'connexion_echouee', 'changer_mot_de_passe', 'reinitialiser_mot_de_passe',
  'creer_administrateur',
  'modifier_fiche', 'retirer_declaration', 'acces_refuse'));

COMMIT;
