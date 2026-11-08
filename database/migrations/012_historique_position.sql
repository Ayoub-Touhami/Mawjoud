-- 012 : historique des positions. Toute position posée ou changée y est copiée par un déclencheur ;
-- changer une position existante exige un motif : jamais d'écrasement silencieux.
--
-- Le back-end indique, dans la même transaction et avant la modification :
--   SET LOCAL mawjoud.motif_position = '…';         -- obligatoire si une position existait
--   SET LOCAL mawjoud.acteur_id = '…';              -- compte qui agit (facultatif)
--   SET LOCAL mawjoud.demande_position_id = '…';    -- demande validée (facultatif)
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('012', '012_historique_position');

CREATE TABLE annuaire.historique_position (
  id                  bigint           GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pharmacie_id        bigint           NOT NULL REFERENCES annuaire.pharmacie (id),
  ancienne_latitude   double precision,
  ancienne_longitude  double precision,
  ancienne_confirmee  boolean,
  nouvelle_latitude   double precision,
  nouvelle_longitude  double precision,
  nouvelle_confirmee  boolean          NOT NULL,
  source_gps          text,
  motif               text,
  -- Sans clé étrangère : l'historique ne se modifie jamais, même à la suppression d'un compte.
  acteur_id           bigint,
  demande_position_id bigint           REFERENCES prive.demande_position (id),
  created_at          timestamptz      NOT NULL DEFAULT now()
);
COMMENT ON TABLE annuaire.historique_position IS 'Journal des positions : on y ajoute, on n''y modifie ni n''y supprime rien.';

-- Historique d'une fiche, du plus récent au plus ancien ; couvre la clé étrangère.
CREATE INDEX historique_position_pharmacie ON annuaire.historique_position (pharmacie_id, created_at DESC);
-- Clé étrangère.
CREATE INDEX historique_position_demande   ON annuaire.historique_position (demande_position_id)
  WHERE demande_position_id IS NOT NULL;

CREATE FUNCTION annuaire.tracer_position() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  motif   text   := nullif(current_setting('mawjoud.motif_position', true), '');
  acteur  bigint := nullif(current_setting('mawjoud.acteur_id', true), '')::bigint;
  demande bigint := nullif(current_setting('mawjoud.demande_position_id', true), '')::bigint;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.latitude IS NULL THEN
      RETURN NULL;
    END IF;
    INSERT INTO annuaire.historique_position
      (pharmacie_id, nouvelle_latitude, nouvelle_longitude, nouvelle_confirmee, source_gps, motif, acteur_id, demande_position_id)
    VALUES
      (NEW.id, NEW.latitude, NEW.longitude, NEW.position_confirmee, NEW.source_gps,
       coalesce(motif, 'création de la fiche'), acteur, demande);
    RETURN NULL;
  END IF;

  IF NEW.latitude IS NOT DISTINCT FROM OLD.latitude
     AND NEW.longitude IS NOT DISTINCT FROM OLD.longitude
     AND NEW.position_confirmee = OLD.position_confirmee THEN
    RETURN NULL;
  END IF;
  IF OLD.latitude IS NOT NULL AND motif IS NULL THEN
    RAISE EXCEPTION 'La pharmacie % a déjà une position : indiquez un motif (mawjoud.motif_position) pour la changer.', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO annuaire.historique_position
    (pharmacie_id, ancienne_latitude, ancienne_longitude, ancienne_confirmee,
     nouvelle_latitude, nouvelle_longitude, nouvelle_confirmee, source_gps, motif, acteur_id, demande_position_id)
  VALUES
    (NEW.id, OLD.latitude, OLD.longitude, OLD.position_confirmee,
     NEW.latitude, NEW.longitude, NEW.position_confirmee, NEW.source_gps, motif, acteur, demande);
  RETURN NULL;
END;
$$;
CREATE TRIGGER pharmacie_tracer_position
  AFTER INSERT OR UPDATE OF latitude, longitude, position_confirmee ON annuaire.pharmacie
  FOR EACH ROW EXECUTE FUNCTION annuaire.tracer_position();

CREATE TRIGGER historique_position_fige BEFORE UPDATE OR DELETE ON annuaire.historique_position
  FOR EACH ROW EXECUTE FUNCTION public.interdire_modification();
CREATE TRIGGER historique_position_fige_vidage BEFORE TRUNCATE ON annuaire.historique_position
  FOR EACH STATEMENT EXECUTE FUNCTION public.interdire_modification();

COMMIT;
