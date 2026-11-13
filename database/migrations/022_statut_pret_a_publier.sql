-- 022 : statut « pret_a_publier ».
-- Une fiche complète (position confirmée, nom relu, ville, gouvernorat) attend ici l'autorisation
-- de publication des sources. Elle n'apparaît pas sur le site : les vues publiques ne lisent que
-- « publiee ». Le passage à « publiee » se fera d'un seul UPDATE quand les autorisations seront obtenues.
-- À l'import : les 755 fiches complètes de pharmacies_final.csv ; les 47 dont le nom est un nom
-- de personne restent « a_relire », puis passent à « pret_a_publier » après relecture.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('022', '022_statut_pret_a_publier');

ALTER TABLE annuaire.pharmacie DROP CONSTRAINT pharmacie_statut_publication_check;
ALTER TABLE annuaire.pharmacie ADD CONSTRAINT pharmacie_statut_publication_check
  CHECK (statut_publication IN ('en_attente_position', 'a_relire', 'pret_a_publier', 'publiee',
                                'non_publiable', 'fermee', 'fusionnee'));

-- Même exigence que pour une fiche publiée : rien d'incomplet n'attend la publication.
ALTER TABLE annuaire.pharmacie DROP CONSTRAINT pharmacie_publique_complete;
ALTER TABLE annuaire.pharmacie ADD CONSTRAINT pharmacie_publique_complete CHECK (
  statut_publication NOT IN ('pret_a_publier', 'publiee')
  OR (position_confirmee AND nom IS NOT NULL AND NOT nom_a_verifier
      AND ville IS NOT NULL AND gouvernorat_code IS NOT NULL)
);

COMMENT ON COLUMN annuaire.pharmacie.statut_publication IS
  'en_attente_position, a_relire (nom à relire), pret_a_publier (complète, attend l''autorisation des sources), '
  'publiee (seule visible), non_publiable, fermee, fusionnee.';

COMMIT;
