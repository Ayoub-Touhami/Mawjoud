-- 021 : rôles de groupe, sans connexion ni mot de passe.
-- Les rôles PostgreSQL sont communs à tout le serveur : préfixe « mawjoud_ » pour ne pas gêner cleanapp.
-- Les comptes de connexion (avec mot de passe dans .env) seront créés à part, membres de ces rôles.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('021', '021_roles');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mawjoud_lecture_publique') THEN
    CREATE ROLE mawjoud_lecture_publique NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mawjoud_application') THEN
    CREATE ROLE mawjoud_application NOLOGIN;
  END IF;
END;
$$;

REVOKE ALL ON SCHEMA annuaire, prive, publique FROM PUBLIC;

-- Lecture publique : uniquement les vues du schéma publique.
GRANT USAGE  ON SCHEMA publique TO mawjoud_lecture_publique;
GRANT SELECT ON ALL TABLES IN SCHEMA publique TO mawjoud_lecture_publique;

-- Application : lit et écrit les données, sans modifier le schéma.
GRANT USAGE ON SCHEMA annuaire, prive, publique TO mawjoud_application;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA annuaire, prive TO mawjoud_application;
GRANT SELECT ON ALL TABLES IN SCHEMA publique TO mawjoud_application;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA annuaire, prive TO mawjoud_application;
-- Les historiques et le journal se complètent, ils ne se corrigent pas.
REVOKE UPDATE, DELETE ON annuaire.historique_position, annuaire.historique_stock, prive.journal_audit
  FROM mawjoud_application;
-- Seules les migrations changent les gouvernorats.
REVOKE INSERT, UPDATE, DELETE ON annuaire.gouvernorat FROM mawjoud_application;

COMMIT;
