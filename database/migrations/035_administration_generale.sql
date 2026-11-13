-- 035 : administration générale (Partie 9c) : correction du nom, création d'une fiche, fusion de fiches.
--
-- 1. Droits de mawjoud_application sur annuaire.pharmacie (les plus petits possibles) :
--    - UPDATE de nom (correction) et de fusionnee_dans (fusion), en plus des colonnes de 032 ;
--    - INSERT de quelques colonnes seulement (création d'une fiche pour une demande d'ajout) : jamais la
--      position, ni le statut (la fiche naît « en_attente_position », valeur par défaut), ni les sources libres.
-- 2. Création : seul un administrateur non suspendu crée une fiche (déclencheur), sans position.
-- 3. Fiche fusionnée : plus aucune modification par l'application (fiche, horaires, disponibilités).
--    Le passage à « fusionnee » n'est possible que pendant une fusion menée par un administrateur :
--      SELECT set_config('mawjoud.fusion', '<id de la fiche fusionnée>', true);
-- 4. Fusion : les disponibilités les plus récentes de la fiche fusionnée sont copiées vers la fiche conservée
--    avec leur date et leur déclarant d'origine. verifier_declarant (014) l'accepte seulement pendant une fusion
--    menée par un administrateur, et seulement pour la copie exacte d'une déclaration existante de la fiche
--    fusionnée (même médicament, statut, date et déclarant). Rien d'autre ne change dans la règle R3, R9.
-- Les scripts du serveur (superutilisateur) restent hors du contrôle de l'acteur ; eux seuls peuvent faire sortir
-- une fiche de « fusionnee » (rattrapage manuel d'une fusion faite par erreur, docs/API_ADMIN.md), toujours sous
-- les contraintes de la table (une fiche publiée reste complète).
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('035', '035_administration_generale');

-- 1.
GRANT UPDATE (nom, fusionnee_dans) ON annuaire.pharmacie TO mawjoud_application;
GRANT INSERT (nom, rue, quartier, ville, code_postal, gouvernorat_code, telephone_principal, sources)
  ON annuaire.pharmacie TO mawjoud_application;

-- Fusion en cours dans cette transaction : identifiant de la fiche fusionnée, ou null.
CREATE FUNCTION annuaire.fusion_en_cours() RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('mawjoud.fusion', true), '')::bigint;
$$;

-- 2.
CREATE FUNCTION annuaire.controler_creation_fiche() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  u record;
BEGIN
  IF NOT annuaire.est_application() THEN
    RETURN NEW;
  END IF;
  SELECT * INTO u FROM annuaire.acteur_actif();
  IF u.role IS DISTINCT FROM 'administrateur' THEN
    RAISE EXCEPTION 'Seul un administrateur crée une fiche.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.statut_publication <> 'en_attente_position' OR NEW.latitude IS NOT NULL THEN
    RAISE EXCEPTION 'Une fiche créée par l''administration naît en attente de position, sans position.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER pharmacie_controle_creation BEFORE INSERT ON annuaire.pharmacie
  FOR EACH ROW EXECUTE FUNCTION annuaire.controler_creation_fiche();

-- 3. Remplace la fonction de 032 (même règles, plus : fiche fusionnée figée, passage à « fusionnee » encadré).
CREATE OR REPLACE FUNCTION annuaire.controler_modification_fiche() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  u record;
  libres CONSTANT text[] := ARRAY['telephone_principal', 'telephones_autres', 'garde', 'updated_at'];
  fusion CONSTANT boolean := NEW.statut_publication = 'fusionnee' AND OLD.statut_publication <> 'fusionnee';
BEGIN
  IF OLD.statut_publication = 'fusionnee' AND annuaire.est_application() THEN
    RAISE EXCEPTION 'Fiche fusionnée : elle ne se modifie plus (voir sa fiche conservée).' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF fusion THEN
    -- Seule une fusion menée par un administrateur, sur cette fiche, la fait passer à « fusionnee ».
    IF annuaire.est_application() AND (annuaire.fusion_en_cours() IS DISTINCT FROM OLD.id
       OR (SELECT role FROM annuaire.acteur_actif()) IS DISTINCT FROM 'administrateur') THEN
      RAISE EXCEPTION 'Le statut « fusionnee » ne s''obtient que par une fusion.' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW.statut_publication IS DISTINCT FROM OLD.statut_publication
     AND NOT annuaire.transition_publication_autorisee(OLD.statut_publication, NEW.statut_publication)
     -- Rattrapage manuel d'une fusion faite par erreur : scripts du serveur seulement (jamais l'API).
     AND NOT (OLD.statut_publication = 'fusionnee' AND NOT annuaire.est_application()) THEN
    RAISE EXCEPTION 'Transition de statut interdite : % vers %.', OLD.statut_publication, NEW.statut_publication
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT annuaire.est_application() THEN
    RETURN NEW;
  END IF;
  SELECT * INTO u FROM annuaire.acteur_actif();
  IF u.role = 'administrateur' THEN
    RETURN NEW;
  END IF;
  IF u.role = 'pharmacien' AND annuaire.pharmacien_de(u.id, OLD.id)
     AND (to_jsonb(NEW) - libres) = (to_jsonb(OLD) - libres) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Modification refusée : un pharmacien ne change que le téléphone et la garde de sa pharmacie.'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE OR REPLACE FUNCTION annuaire.controler_modification_horaire() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  u record;
BEGIN
  IF NOT annuaire.est_application() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF EXISTS (SELECT 1 FROM annuaire.pharmacie p
              WHERE p.id IN (CASE WHEN TG_OP = 'INSERT' THEN NEW.pharmacie_id ELSE OLD.pharmacie_id END,
                             CASE WHEN TG_OP = 'DELETE' THEN OLD.pharmacie_id ELSE NEW.pharmacie_id END)
                AND p.statut_publication = 'fusionnee') THEN
    RAISE EXCEPTION 'Fiche fusionnée : ses horaires ne se modifient plus.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO u FROM annuaire.acteur_actif();
  IF u.role = 'administrateur'
     OR (u.role = 'pharmacien'
         AND (TG_OP = 'INSERT' OR annuaire.pharmacien_de(u.id, OLD.pharmacie_id))
         AND (TG_OP = 'DELETE' OR annuaire.pharmacien_de(u.id, NEW.pharmacie_id))) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'Horaires : un pharmacien ne modifie que ceux de sa pharmacie.' USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- 4. Remplace la fonction de 014 (même règle R3, R9 ; plus : fiche fusionnée figée, copie pendant une fusion).
CREATE OR REPLACE FUNCTION annuaire.verifier_declarant() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  source bigint := annuaire.fusion_en_cours();
BEGIN
  IF NEW.statut IS NULL THEN
    RETURN NEW;
  END IF;
  IF annuaire.est_application()
     AND EXISTS (SELECT 1 FROM annuaire.pharmacie WHERE id = NEW.pharmacie_id AND statut_publication = 'fusionnee') THEN
    RAISE EXCEPTION 'Fiche fusionnée : aucune déclaration.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF EXISTS (
    SELECT 1
      FROM prive.rattachement_pharmacien r
      JOIN prive.utilisateur u ON u.id = r.utilisateur_id
     WHERE r.pharmacie_id = NEW.pharmacie_id
       AND r.utilisateur_id = NEW.declare_par
       AND r.statut = 'validee'
       AND NOT u.suspendu
  ) THEN
    RETURN NEW;
  END IF;
  -- Fusion : copie d'une déclaration de la fiche fusionnée, faite par un administrateur.
  IF source IS NOT NULL AND source <> NEW.pharmacie_id
     AND (SELECT role FROM annuaire.acteur_actif()) = 'administrateur'
     AND EXISTS (SELECT 1 FROM annuaire.stock s
                  WHERE s.pharmacie_id = source AND s.medicament_id = NEW.medicament_id
                    AND s.statut = NEW.statut AND s.declare_le = NEW.declare_le AND s.declare_par = NEW.declare_par) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Seul un pharmacien vérifié de cette pharmacie peut déclarer son stock (R3, R9).'
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

COMMIT;
