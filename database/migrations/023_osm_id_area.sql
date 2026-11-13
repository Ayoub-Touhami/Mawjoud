-- 023 : identifiant OpenStreetMap de type « a » (area).
-- L'export OSM utilisé (osm_pharmacies.csv) donne le type « a » aux pharmacies dessinées comme
-- une surface (bâtiment) plutôt que comme un point : 3 des 100 fiches OSM du fichier final.
-- La valeur de la source est gardée telle quelle, sans conversion supposée vers w ou r.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('023', '023_osm_id_area');

ALTER TABLE prive.pharmacie_interne DROP CONSTRAINT pharmacie_interne_osm_id_check;
ALTER TABLE prive.pharmacie_interne ADD CONSTRAINT pharmacie_interne_osm_id_check
  CHECK (osm_id ~ '^[nwra][0-9]+$');

COMMENT ON COLUMN prive.pharmacie_interne.osm_id IS
  'Type + identifiant OSM : n (point), w (chemin), r (relation), a (surface, telle que donnée par l''export d''origine).';

COMMIT;
