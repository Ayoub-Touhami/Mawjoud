-- 001 : registre des migrations appliquées.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;

CREATE TABLE public.schema_migrations (
  version     text        PRIMARY KEY CHECK (version ~ '^[0-9]{3}$'),
  nom         text        NOT NULL UNIQUE,
  applique_le timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.schema_migrations IS
  'Une ligne par migration appliquée. Une migration ne passe qu''une fois : sa clé primaire l''interdit.';

INSERT INTO public.schema_migrations (version, nom) VALUES ('001', '001_schema_migrations');

COMMIT;
