-- 015 : alertes de disponibilité (F10). Un gouvernorat vide veut dire « toutes les villes ».
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('015', '015_alerte');

CREATE TABLE prive.alerte (
  id                       bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid                     uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  utilisateur_id           bigint      NOT NULL REFERENCES prive.utilisateur (id) ON DELETE CASCADE,
  medicament_id            bigint      NOT NULL REFERENCES annuaire.medicament (id),
  gouvernorat_code         smallint    REFERENCES annuaire.gouvernorat (code),
  statut                   text        NOT NULL DEFAULT 'active' CHECK (statut IN ('active', 'terminee')),
  declenchee_le            timestamptz,
  declenchee_par_pharmacie bigint      REFERENCES annuaire.pharmacie (id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (declenchee_le IS NULL OR statut = 'terminee'),
  CHECK ((declenchee_le IS NULL) = (declenchee_par_pharmacie IS NULL))
);
COMMENT ON TABLE prive.alerte IS 'R13 : seuls le compte, le médicament et le lieu sont gardés.';

-- Pas de doublon actif pour le même médicament et le même lieu ; « toutes les villes » compte comme un lieu.
CREATE UNIQUE INDEX alerte_sans_doublon ON prive.alerte (utilisateur_id, medicament_id, gouvernorat_code)
  NULLS NOT DISTINCT WHERE statut = 'active';
-- Évaluation après chaque déclaration « disponible » (F11).
CREATE INDEX alerte_a_evaluer ON prive.alerte (medicament_id, gouvernorat_code) WHERE statut = 'active';
-- Mes alertes ; clé étrangère.
CREATE INDEX alerte_utilisateur ON prive.alerte (utilisateur_id);
-- Clé étrangère.
CREATE INDEX alerte_pharmacie ON prive.alerte (declenchee_par_pharmacie) WHERE declenchee_par_pharmacie IS NOT NULL;

CREATE FUNCTION prive.verifier_alerte() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM prive.exiger_role(NEW.utilisateur_id, 'patient');
  RETURN NEW;
END;
$$;
CREATE TRIGGER alerte_role BEFORE INSERT OR UPDATE OF utilisateur_id ON prive.alerte
  FOR EACH ROW EXECUTE FUNCTION prive.verifier_alerte();
CREATE TRIGGER alerte_maj BEFORE UPDATE ON prive.alerte
  FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();

COMMIT;
