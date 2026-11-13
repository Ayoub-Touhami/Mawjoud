-- 030 : mise à jour des statistiques de l'annuaire (ANALYZE) par l'application.
-- Sous PostgreSQL 16, seul le propriétaire d'une table peut l'analyser (le droit MAINTAIN n'arrive
-- qu'en 17) : ANALYZE lancé par mawjoud_api est ignoré. Cette fonction, exécutée avec les droits de
-- son propriétaire (SECURITY DEFINER), ne fait QUE cela, sans paramètre ni texte dynamique.
-- Usage : après une écriture en masse (publication de fiches, données des tests), pour que
-- PostgreSQL choisisse les bons index (par exemple pharmacie_publiee_position, migration 029).
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('030', '030_analyser_annuaire');

CREATE FUNCTION annuaire.analyser_annuaire() RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  ANALYZE annuaire.pharmacie;
  ANALYZE annuaire.horaire;
  ANALYZE annuaire.medicament;
  ANALYZE annuaire.stock;
END;
$$;
COMMENT ON FUNCTION annuaire.analyser_annuaire() IS
  'ANALYZE des tables de l''annuaire, pour l''application (SECURITY DEFINER, portée fixe). Migration 030.';

REVOKE ALL ON FUNCTION annuaire.analyser_annuaire() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION annuaire.analyser_annuaire() TO mawjoud_application;

COMMIT;
