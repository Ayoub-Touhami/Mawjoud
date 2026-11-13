-- 024 : seuls les rôles du projet se connectent à la base.
-- Par défaut, PostgreSQL donne CONNECT à PUBLIC, c'est-à-dire à tout compte du serveur
-- (par exemple ceux d'un autre projet comme cleanapp). On le retire et on le donne
-- explicitement aux deux rôles de groupe ; leurs membres (comptes de connexion) en héritent.
-- Le superutilisateur et le propriétaire de la base gardent l'accès.
-- current_database() : la migration ne dépend pas du nom de la base.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('024', '024_connexion_base');

DO $$
BEGIN
  EXECUTE format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO mawjoud_application, mawjoud_lecture_publique',
                 current_database());
END;
$$;

COMMIT;
