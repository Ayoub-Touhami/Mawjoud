-- 003 : schémas et fonctions communes.
--   annuaire : données de l'annuaire et du stock (lisibles par le public seulement via « publique »).
--   prive    : comptes, e-mails, données internes, demandes, journal. Jamais exposé au public.
--   publique : vues, seule porte d'entrée des requêtes publiques.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('003', '003_schemas_et_fonctions');

CREATE SCHEMA annuaire;
CREATE SCHEMA prive;
CREATE SCHEMA publique;
COMMENT ON SCHEMA annuaire IS 'Annuaire des pharmacies, médicaments et stocks.';
COMMENT ON SCHEMA prive    IS 'Données personnelles et internes : jamais accessibles au public.';
COMMENT ON SCHEMA publique IS 'Vues publiques : seules tables lisibles par le rôle de lecture publique.';

-- Texte sans accent et en minuscules. IMMUTABLE pour servir dans un index :
-- le dictionnaire est fixé, ce qui rend le résultat stable.
CREATE FUNCTION public.normaliser(texte text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  RETURN lower(public.unaccent('public.unaccent'::regdictionary, texte));

-- Met à jour updated_at à chaque modification.
CREATE FUNCTION public.maj_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Interdit toute modification ou suppression (historiques et journal).
CREATE FUNCTION public.interdire_modification() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'La table %.% ne se modifie pas : on y ajoute seulement des lignes.',
    TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$;

COMMIT;
