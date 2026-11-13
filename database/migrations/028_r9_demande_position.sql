-- 028 : règle R9 sur les demandes de position (réservée depuis la Partie 6, écrite en Partie 8).
-- Un pharmacien ne propose une position que pour une pharmacie à laquelle il est rattaché ET validé.
-- (Le rôle « pharmacien » est déjà vérifié en 011, la suspension en 027.)
-- Indépendante des migrations 029 et suivantes : elle ne s'appuie que sur 005, 010 et 011.
-- Sur mawjoud, elle est appliquée après 029 à 031 ; sur une base neuve, avant : le résultat est le même.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('028', '028_r9_demande_position');

CREATE FUNCTION prive.verifier_demandeur_rattache() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Suppression du compte (ON DELETE SET NULL) : la demande garde sa trace sans demandeur.
  IF TG_OP = 'UPDATE' AND NEW.demandeur_id IS NULL AND NEW.pharmacie_id = OLD.pharmacie_id THEN
    RETURN NEW;
  END IF;
  IF NEW.demandeur_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM prive.rattachement_pharmacien r
     WHERE r.utilisateur_id = NEW.demandeur_id
       AND r.pharmacie_id = NEW.pharmacie_id
       AND r.statut = 'validee'
  ) THEN
    RAISE EXCEPTION 'Un pharmacien ne propose une position que pour sa pharmacie (R9).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER demande_position_r9 BEFORE INSERT OR UPDATE OF demandeur_id, pharmacie_id ON prive.demande_position
  FOR EACH ROW EXECUTE FUNCTION prive.verifier_demandeur_rattache();

COMMIT;
