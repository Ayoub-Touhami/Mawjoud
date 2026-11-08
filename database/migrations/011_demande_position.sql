-- 011 : un pharmacien propose une position, l'administrateur la valide ou la refuse.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('011', '011_demande_position');

CREATE TABLE prive.demande_position (
  id           bigint           GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid         uuid             NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  pharmacie_id bigint           NOT NULL REFERENCES annuaire.pharmacie (id),
  demandeur_id bigint           REFERENCES prive.utilisateur (id) ON DELETE SET NULL,
  latitude     double precision NOT NULL CHECK (latitude BETWEEN 30 AND 38),
  longitude    double precision NOT NULL CHECK (longitude BETWEEN 7 AND 12),
  commentaire  text             CHECK (length(commentaire) <= 1000),
  statut       text             NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'validee', 'refusee')),
  motif_refus  text,
  decide_par   bigint           REFERENCES prive.utilisateur (id) ON DELETE SET NULL,
  decide_le    timestamptz,
  created_at   timestamptz      NOT NULL DEFAULT now(),
  updated_at   timestamptz      NOT NULL DEFAULT now(),
  CHECK ((statut = 'en_attente') = (decide_le IS NULL)),
  CHECK (statut <> 'refusee' OR motif_refus IS NOT NULL)
);
COMMENT ON TABLE prive.demande_position IS
  'Position proposée. Validée, elle est recopiée dans annuaire.pharmacie et l''ancienne reste dans l''historique.';

-- Une seule proposition en cours par pharmacie.
CREATE UNIQUE INDEX demande_position_une_en_attente ON prive.demande_position (pharmacie_id) WHERE statut = 'en_attente';
-- Clés étrangères.
CREATE INDEX demande_position_pharmacie  ON prive.demande_position (pharmacie_id);
CREATE INDEX demande_position_demandeur  ON prive.demande_position (demandeur_id);
CREATE INDEX demande_position_decide_par ON prive.demande_position (decide_par);

CREATE FUNCTION prive.verifier_demande_position() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM prive.exiger_role(NEW.demandeur_id, 'pharmacien');
  PERFORM prive.exiger_role(NEW.decide_par, 'administrateur');
  RETURN NEW;
END;
$$;
CREATE TRIGGER demande_position_roles BEFORE INSERT OR UPDATE OF demandeur_id, decide_par ON prive.demande_position
  FOR EACH ROW EXECUTE FUNCTION prive.verifier_demande_position();
CREATE TRIGGER demande_position_maj BEFORE UPDATE ON prive.demande_position
  FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();

COMMIT;
