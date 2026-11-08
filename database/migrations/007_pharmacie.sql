-- 007 : pharmacies, publiées ou en attente de position, dans une seule table.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('007', '007_pharmacie');

CREATE TABLE annuaire.pharmacie (
  id                  bigint           GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid                uuid             NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  id_source           text             UNIQUE CHECK (id_source ~ '^C[0-9]{5}$'),
  nom                 text             CHECK (nom <> ''),
  rue                 text,
  quartier            text,
  ville               text             CHECK (ville <> ''),
  code_postal         text             CHECK (code_postal ~ '^[0-9]{4}$'),
  gouvernorat_code    smallint         REFERENCES annuaire.gouvernorat (code),
  telephone_principal text             CHECK (telephone_principal ~ '^\+216[0-9]{8}$'),
  telephones_autres   text[]           NOT NULL DEFAULT '{}'
                        CHECK (array_to_string(telephones_autres, ' ') ~ '^(\+216[0-9]{8}( \+216[0-9]{8})*)?$'),
  latitude            double precision CHECK (latitude BETWEEN 30 AND 38),
  longitude           double precision CHECK (longitude BETWEEN 7 AND 12),
  position_confirmee  boolean          NOT NULL DEFAULT false,
  source_gps          text             CHECK (source_gps IN ('tunidoc', 'osm_telephone', 'osm_nom_ville',
                                                             'saisie_pharmacien', 'saisie_admin')),
  precision_gps       text             NOT NULL DEFAULT 'inconnu' CHECK (precision_gps IN ('exact', 'nom', 'inconnu')),
  garde               text             CHECK (garde IN ('jour', 'nuit')),
  horaires_texte      text,
  statut_publication  text             NOT NULL DEFAULT 'en_attente_position'
                        CHECK (statut_publication IN ('en_attente_position', 'a_relire', 'publiee',
                                                      'non_publiable', 'fermee', 'fusionnee')),
  fusionnee_dans      bigint           REFERENCES annuaire.pharmacie (id),
  a_verifier          boolean          NOT NULL DEFAULT false,
  -- Nom de pharmacie qui est un nom de personne : exclu de la publication tant qu'il n'est pas relu.
  nom_a_verifier      boolean          NOT NULL DEFAULT false,
  sources             text[]           NOT NULL DEFAULT '{}'
                        CHECK (sources <@ ARRAY['tunidoc', 'goafricaonline', 'medtn', 'pdf', 'osm',
                                                'saisie_pharmacien', 'saisie_admin']::text[]),
  created_at          timestamptz      NOT NULL DEFAULT now(),
  updated_at          timestamptz      NOT NULL DEFAULT now(),

  CONSTRAINT pharmacie_position_complete CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT pharmacie_position_sourcee  CHECK (latitude IS NULL OR source_gps IS NOT NULL),
  CONSTRAINT pharmacie_confirmation      CHECK (NOT position_confirmee OR latitude IS NOT NULL),
  -- Règle métier : une pharmacie publique a une position confirmée, un nom relu, une ville et un gouvernorat.
  CONSTRAINT pharmacie_publique_complete CHECK (
    statut_publication <> 'publiee'
    OR (position_confirmee AND nom IS NOT NULL AND NOT nom_a_verifier
        AND ville IS NOT NULL AND gouvernorat_code IS NOT NULL)
  ),
  CONSTRAINT pharmacie_fusion CHECK (
    (statut_publication = 'fusionnee') = (fusionnee_dans IS NOT NULL) AND fusionnee_dans IS DISTINCT FROM id
  )
);
COMMENT ON TABLE annuaire.pharmacie IS
  'Annuaire complet. Seules les lignes « publiee » sortent, par la vue publique.pharmacie.';
COMMENT ON COLUMN annuaire.pharmacie.id_source IS 'Identifiant C00001… des CSV ; vide pour une fiche créée sur le site.';
COMMENT ON COLUMN annuaire.pharmacie.horaires_texte IS 'Texte d''origine du CSV, gardé pour la traçabilité ; la forme structurée est dans annuaire.horaire.';

-- Carte : recherche des pharmacies publiées dans le cadre affiché (point natif, sans PostGIS).
CREATE INDEX pharmacie_carte ON annuaire.pharmacie USING gist (point(longitude, latitude))
  WHERE statut_publication = 'publiee';
-- Filtre par gouvernorat (recherche, alertes) ; clé étrangère.
CREATE INDEX pharmacie_gouvernorat ON annuaire.pharmacie (gouvernorat_code);
-- Filtre par ville, sans accent ni casse.
CREATE INDEX pharmacie_ville ON annuaire.pharmacie (public.normaliser(ville));
-- Recherche par nom tolérante aux fautes (réclamation, administration).
CREATE INDEX pharmacie_nom_trgm ON annuaire.pharmacie USING gin (public.normaliser(nom) public.gin_trgm_ops);
-- Doublons de téléphone (402 numéros partagés à contrôler).
CREATE INDEX pharmacie_telephone ON annuaire.pharmacie (telephone_principal);
-- Listes de l'administration (en attente, à relire, fermées…).
CREATE INDEX pharmacie_statut ON annuaire.pharmacie (statut_publication);
-- Clé étrangère.
CREATE INDEX pharmacie_fusionnee_dans ON annuaire.pharmacie (fusionnee_dans) WHERE fusionnee_dans IS NOT NULL;

CREATE TRIGGER pharmacie_maj BEFORE UPDATE ON annuaire.pharmacie
  FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();

COMMIT;
