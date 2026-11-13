-- 025 : compte de connexion du back-end, mawjoud_api.
-- Membre de mawjoud_application (lecture et écriture des données, aucun droit sur le schéma ni sur
-- schema_migrations). Ni superutilisateur, ni création de base ou de rôle, ni réplication.
-- Pas de mot de passe ici : database/definir-mot-de-passe-api.ps1 le génère, envoie au serveur
-- son empreinte SCRAM seulement, et l'écrit dans .env (API_DATABASE_URL), jamais affiché.
-- Les rôles sont communs au serveur : la migration sert aussi à mawjoud_test sans recréer le rôle.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('025', '025_role_api');

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mawjoud_api') THEN
    CREATE ROLE mawjoud_api LOGIN INHERIT
      NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
      CONNECTION LIMIT 20;
  END IF;
END;
$$;
-- Revérifié à chaque base : le rôle ne doit jamais avoir gagné de pouvoir entre-temps.
ALTER ROLE mawjoud_api NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT mawjoud_application TO mawjoud_api;

-- Garde-fous : une requête ou une transaction oubliée ne bloque pas la base.
ALTER ROLE mawjoud_api SET statement_timeout = '15s';
ALTER ROLE mawjoud_api SET idle_in_transaction_session_timeout = '30s';

COMMIT;
