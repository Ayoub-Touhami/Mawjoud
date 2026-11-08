-- 010 : rattachement pharmacien-pharmacie (réclamation ou demande d'ajout), vérifié par l'administrateur.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('010', '010_rattachement_pharmacien');

CREATE TABLE prive.rattachement_pharmacien (
  id                          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uuid                        uuid        NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  utilisateur_id              bigint      NOT NULL REFERENCES prive.utilisateur (id) ON DELETE CASCADE,
  -- Vide pour une demande d'ajout d'une pharmacie absente de l'annuaire.
  pharmacie_id                bigint      REFERENCES annuaire.pharmacie (id),
  ajout_nom                   text,
  ajout_adresse               text,
  ajout_ville                 text,
  ajout_telephone             text        CHECK (ajout_telephone ~ '^\+216[0-9]{8}$'),
  justificatif_texte          text        CHECK (length(justificatif_texte) <= 2000),
  justificatif_fichier_nom    text,
  justificatif_fichier_taille integer     CHECK (justificatif_fichier_taille > 0),
  statut                      text        NOT NULL DEFAULT 'en_attente'
                                CHECK (statut IN ('en_attente', 'validee', 'refusee', 'retiree')),
  conflit                     boolean     NOT NULL DEFAULT false,
  motif_code                  text        CHECK (motif_code IN ('justificatif_illisible', 'informations_incompletes',
                                                                'pharmacie_attribuee', 'pharmacie_fermee',
                                                                'compte_supprime', 'autre')),
  motif_precision             text,
  decide_par                  bigint      REFERENCES prive.utilisateur (id) ON DELETE SET NULL,
  decide_le                   timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  CHECK (pharmacie_id IS NOT NULL OR (ajout_nom IS NOT NULL AND ajout_ville IS NOT NULL)),
  CHECK (statut <> 'validee' OR pharmacie_id IS NOT NULL),
  CHECK (statut NOT IN ('refusee', 'retiree') OR motif_code IS NOT NULL),
  CHECK ((statut = 'en_attente') = (decide_le IS NULL))
);
COMMENT ON TABLE prive.rattachement_pharmacien IS
  'Lien entre un compte pharmacien et sa pharmacie. Validé = pharmacie inscrite (F5, F8).';

-- Une seule pharmacie par compte (décision du 8 novembre 2026) : retirer cet index suffira pour en autoriser plusieurs.
CREATE UNIQUE INDEX rattachement_un_par_compte    ON prive.rattachement_pharmacien (utilisateur_id) WHERE statut = 'validee';
-- Une pharmacie n'a qu'un compte vérifié.
CREATE UNIQUE INDEX rattachement_un_par_pharmacie ON prive.rattachement_pharmacien (pharmacie_id)   WHERE statut = 'validee';
-- Une seule demande en cours par compte (erreur « demande-en-cours » du front-end).
CREATE UNIQUE INDEX rattachement_une_demande      ON prive.rattachement_pharmacien (utilisateur_id) WHERE statut = 'en_attente';
-- Clés étrangères ; « la pharmacie est-elle inscrite ? » est lu à chaque affichage.
CREATE INDEX rattachement_pharmacie  ON prive.rattachement_pharmacien (pharmacie_id, statut);
CREATE INDEX rattachement_decide_par ON prive.rattachement_pharmacien (decide_par);
-- File de l'administration.
CREATE INDEX rattachement_en_attente ON prive.rattachement_pharmacien (created_at) WHERE statut = 'en_attente';

CREATE FUNCTION prive.verifier_rattachement() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM prive.exiger_role(NEW.utilisateur_id, 'pharmacien');
  PERFORM prive.exiger_role(NEW.decide_par, 'administrateur');
  RETURN NEW;
END;
$$;
CREATE TRIGGER rattachement_roles BEFORE INSERT OR UPDATE OF utilisateur_id, decide_par ON prive.rattachement_pharmacien
  FOR EACH ROW EXECUTE FUNCTION prive.verifier_rattachement();
CREATE TRIGGER rattachement_maj BEFORE UPDATE ON prive.rattachement_pharmacien
  FOR EACH ROW EXECUTE FUNCTION public.maj_updated_at();

COMMIT;
