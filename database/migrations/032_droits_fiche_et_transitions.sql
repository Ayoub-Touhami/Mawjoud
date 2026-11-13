-- 032 : droits resserrés sur annuaire.pharmacie, modifications de fiche contrôlées par la base,
-- transitions de statut de publication en liste blanche (Partie 8, priorité 1).
--
-- 1. Droits de mawjoud_application (donc de mawjoud_api) sur annuaire.pharmacie :
--    plus d'INSERT ni de DELETE (l'API ne crée ni ne supprime de fiche) ; UPDATE limité aux colonnes
--    que l'API écrit réellement :
--      - pharmacien : telephone_principal, telephones_autres, garde ;
--      - administrateur : latitude, longitude, position_confirmee, source_gps, precision_gps
--        (validation d'une position), statut_publication (cycle de publication), nom_a_verifier (relecture).
--    updated_at est mis à jour par déclencheur (pas besoin du droit).
-- 2. Déclencheurs : pour l'API (rôles membres de mawjoud_application), l'acteur est obligatoire
--      SELECT set_config('mawjoud.acteur_id', '<id du compte>', true);
--    - pharmacien non suspendu, rattaché et validé pour CETTE pharmacie : seulement téléphones et garde
--      (fiche) et ses horaires ;
--    - administrateur non suspendu : tout ce que ses droits de colonne permettent ;
--    - autre compte, ou aucun acteur : refusé.
--    Les scripts du serveur (superutilisateur) et les rôles hors application (rôle des tests) n'y sont pas soumis.
-- 3. Transitions de statut : une seule liste, la fonction annuaire.transition_publication_autorisee(),
--    lue par le déclencheur (pour tous, scripts compris) et par l'API (réponse 409 expliquée).
--    Les conditions de publication restent celles de la contrainte pharmacie_publique_complete (007, 022).
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('032', '032_droits_fiche_et_transitions');

-- 1. Droits.
REVOKE INSERT, UPDATE, DELETE ON annuaire.pharmacie FROM mawjoud_application;
GRANT UPDATE (telephone_principal, telephones_autres, garde,
              latitude, longitude, position_confirmee, source_gps, precision_gps,
              statut_publication, nom_a_verifier)
  ON annuaire.pharmacie TO mawjoud_application;

-- 3. Transitions autorisées (de → vers). Une même valeur n'est pas une transition.
CREATE FUNCTION annuaire.transition_publication_autorisee(de text, vers text) RETURNS boolean
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT (de, vers) IN (
    ('en_attente_position', 'a_relire'),        -- position validée, nom à relire
    ('en_attente_position', 'pret_a_publier'),  -- position validée, fiche complète
    ('en_attente_position', 'non_publiable'),
    ('en_attente_position', 'fermee'),
    ('a_relire', 'pret_a_publier'),             -- nom relu
    ('a_relire', 'en_attente_position'),        -- position à refaire
    ('a_relire', 'non_publiable'),
    ('a_relire', 'fermee'),
    ('pret_a_publier', 'publiee'),              -- publication
    ('pret_a_publier', 'a_relire'),
    ('pret_a_publier', 'non_publiable'),
    ('pret_a_publier', 'fermee'),
    ('publiee', 'pret_a_publier'),              -- dépublication
    ('publiee', 'non_publiable'),
    ('publiee', 'fermee'),
    ('non_publiable', 'en_attente_position'),
    ('non_publiable', 'a_relire'),
    ('non_publiable', 'pret_a_publier'),
    ('fermee', 'pret_a_publier'),               -- réouverture
    ('fermee', 'non_publiable')
  );
$$;
COMMENT ON FUNCTION annuaire.transition_publication_autorisee(text, text) IS
  'Liste blanche des transitions de statut_publication (fusionnee : jamais par cette voie). Migration 032.';

-- Vrai si l'utilisateur SQL courant est l'API (membre de mawjoud_application, sans être superutilisateur).
CREATE FUNCTION annuaire.est_application() RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT NOT r.rolsuper AND pg_has_role(current_user, 'mawjoud_application', 'MEMBER')
    FROM pg_roles r WHERE r.rolname = current_user;
$$;

-- Compte qui agit (mawjoud.acteur_id) : identifiant et rôle seulement, s'il existe et n'est pas suspendu ;
-- sinon refus.
CREATE FUNCTION annuaire.acteur_actif(OUT id bigint, OUT role text) LANGUAGE plpgsql STABLE AS $$
DECLARE
  id_acteur bigint := nullif(current_setting('mawjoud.acteur_id', true), '')::bigint;
BEGIN
  IF id_acteur IS NULL THEN
    RAISE EXCEPTION 'Modification de l''annuaire sans acteur (mawjoud.acteur_id) : refusée.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT u.id, u.role INTO id, role FROM prive.utilisateur u WHERE u.id = id_acteur AND NOT u.suspendu;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compte % absent ou suspendu : modification refusée.', id_acteur USING ERRCODE = 'insufficient_privilege';
  END IF;
END;
$$;

CREATE FUNCTION annuaire.pharmacien_de(compte bigint, pharmacie bigint) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM prive.rattachement_pharmacien r
                  WHERE r.utilisateur_id = compte AND r.pharmacie_id = pharmacie AND r.statut = 'validee');
$$;

-- 2. Fiche de la pharmacie.
CREATE FUNCTION annuaire.controler_modification_fiche() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  u record;
  libres CONSTANT text[] := ARRAY['telephone_principal', 'telephones_autres', 'garde', 'updated_at'];
BEGIN
  IF NEW.statut_publication IS DISTINCT FROM OLD.statut_publication
     AND NOT annuaire.transition_publication_autorisee(OLD.statut_publication, NEW.statut_publication) THEN
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
CREATE TRIGGER pharmacie_controle_modification BEFORE UPDATE ON annuaire.pharmacie
  FOR EACH ROW EXECUTE FUNCTION annuaire.controler_modification_fiche();

-- 2 bis. Horaires.
CREATE FUNCTION annuaire.controler_modification_horaire() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  u record;
BEGIN
  IF NOT annuaire.est_application() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
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
CREATE TRIGGER horaire_controle_modification BEFORE INSERT OR UPDATE OR DELETE ON annuaire.horaire
  FOR EACH ROW EXECUTE FUNCTION annuaire.controler_modification_horaire();

COMMIT;
