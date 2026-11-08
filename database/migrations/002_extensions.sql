-- 002 : extensions de recherche (sans accent, sans casse, tolérante aux fautes).
-- unaccent et pg_trgm sont fournies avec PostgreSQL 16 et marquées « trusted » :
-- le propriétaire de la base peut les créer. À n'appliquer qu'avec l'accord de l'équipe.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('002', '002_extensions');

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA public;

COMMIT;
