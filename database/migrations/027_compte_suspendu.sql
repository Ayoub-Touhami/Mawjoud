-- 027 : un compte suspendu n'agit plus sur l'annuaire, même si le back-end se trompe.
-- Le stock était déjà protégé (014, verifier_declarant). On ajoute :
-- - prive.demande_position : un pharmacien suspendu ne propose plus de position ;
-- - annuaire.pharmacie : une position ne change pas au nom d'un compte suspendu (mawjoud.acteur_id) ;
-- - prive.rattachement_pharmacien : un pharmacien suspendu ne demande plus de rattachement.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('027', '027_compte_suspendu');

CREATE FUNCTION prive.exiger_non_suspendu(compte bigint) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF compte IS NOT NULL AND EXISTS (SELECT 1 FROM prive.utilisateur WHERE id = compte AND suspendu) THEN
    RAISE EXCEPTION 'Le compte % est suspendu.', compte USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

CREATE FUNCTION prive.verifier_demandeur_position_actif() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM prive.exiger_non_suspendu(NEW.demandeur_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER demande_position_demandeur_actif BEFORE INSERT OR UPDATE OF demandeur_id, latitude, longitude
  ON prive.demande_position FOR EACH ROW EXECUTE FUNCTION prive.verifier_demandeur_position_actif();

CREATE FUNCTION annuaire.verifier_acteur_position() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM prive.exiger_non_suspendu(nullif(current_setting('mawjoud.acteur_id', true), '')::bigint);
  RETURN NEW;
END;
$$;
CREATE TRIGGER pharmacie_acteur_position_actif BEFORE UPDATE OF latitude, longitude, position_confirmee
  ON annuaire.pharmacie FOR EACH ROW EXECUTE FUNCTION annuaire.verifier_acteur_position();

CREATE FUNCTION prive.verifier_rattachement_demandeur_actif() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM prive.exiger_non_suspendu(NEW.utilisateur_id);
  RETURN NEW;
END;
$$;
CREATE TRIGGER rattachement_demandeur_actif BEFORE INSERT ON prive.rattachement_pharmacien
  FOR EACH ROW EXECUTE FUNCTION prive.verifier_rattachement_demandeur_actif();

COMMIT;
