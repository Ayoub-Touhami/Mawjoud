-- 014 : stock déclaré (dernier état) et historique des déclarations.
-- « À confirmer » n'est jamais stocké : il se calcule à la lecture à partir de declare_le (R6, F7).
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('014', '014_stock');

CREATE TABLE annuaire.stock (
  pharmacie_id  bigint      NOT NULL REFERENCES annuaire.pharmacie (id),
  medicament_id bigint      NOT NULL REFERENCES annuaire.medicament (id),
  -- Vide tant que le médicament est seulement suivi, sans déclaration.
  statut        text        CHECK (statut IN ('disponible', 'quantite_limitee', 'en_rupture')),
  declare_le    timestamptz,
  declare_par   bigint      REFERENCES prive.utilisateur (id) ON DELETE SET NULL,
  suivi_depuis  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pharmacie_id, medicament_id),
  CHECK ((statut IS NULL) = (declare_le IS NULL))
);
COMMENT ON TABLE annuaire.stock IS 'Médicaments suivis par une pharmacie et dernier statut déclaré, en mot (R4, R15).';

-- Résultats d'une recherche : toutes les pharmacies pour un médicament (F3).
CREATE INDEX stock_medicament  ON annuaire.stock (medicament_id, statut);
-- Clé étrangère.
CREATE INDEX stock_declare_par ON annuaire.stock (declare_par);

-- R3 et R9 : seul un pharmacien vérifié, non suspendu et rattaché à CETTE pharmacie déclare son stock.
CREATE FUNCTION annuaire.verifier_declarant() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.statut IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM prive.rattachement_pharmacien r
      JOIN prive.utilisateur u ON u.id = r.utilisateur_id
     WHERE r.pharmacie_id = NEW.pharmacie_id
       AND r.utilisateur_id = NEW.declare_par
       AND r.statut = 'validee'
       AND NOT u.suspendu
  ) THEN
    RAISE EXCEPTION 'Seul un pharmacien vérifié de cette pharmacie peut déclarer son stock (R3, R9).'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stock_declarant BEFORE INSERT OR UPDATE OF statut, declare_le ON annuaire.stock
  FOR EACH ROW EXECUTE FUNCTION annuaire.verifier_declarant();

CREATE TABLE annuaire.historique_stock (
  id            bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pharmacie_id  bigint      NOT NULL REFERENCES annuaire.pharmacie (id),
  medicament_id bigint      NOT NULL REFERENCES annuaire.medicament (id),
  statut        text        NOT NULL CHECK (statut IN ('disponible', 'quantite_limitee', 'en_rupture')),
  declare_le    timestamptz NOT NULL,
  -- Sans clé étrangère : l'historique ne se modifie jamais.
  declare_par   bigint
);
COMMENT ON TABLE annuaire.historique_stock IS 'Toutes les déclarations. Conservation proposée, à valider : 12 mois.';
-- Historique d'un médicament dans une pharmacie ; couvre la clé étrangère pharmacie.
CREATE INDEX historique_stock_pharmacie  ON annuaire.historique_stock (pharmacie_id, medicament_id, declare_le DESC);
-- Clé étrangère.
CREATE INDEX historique_stock_medicament ON annuaire.historique_stock (medicament_id);

CREATE FUNCTION annuaire.tracer_stock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO annuaire.historique_stock (pharmacie_id, medicament_id, statut, declare_le, declare_par)
  VALUES (NEW.pharmacie_id, NEW.medicament_id, NEW.statut, NEW.declare_le, NEW.declare_par);
  RETURN NULL;
END;
$$;
CREATE TRIGGER stock_tracer AFTER INSERT OR UPDATE OF statut, declare_le ON annuaire.stock
  FOR EACH ROW WHEN (NEW.statut IS NOT NULL) EXECUTE FUNCTION annuaire.tracer_stock();

CREATE TRIGGER historique_stock_fige BEFORE UPDATE OR DELETE ON annuaire.historique_stock
  FOR EACH ROW EXECUTE FUNCTION public.interdire_modification();
CREATE TRIGGER historique_stock_fige_vidage BEFORE TRUNCATE ON annuaire.historique_stock
  FOR EACH STATEMENT EXECUTE FUNCTION public.interdire_modification();

COMMIT;
