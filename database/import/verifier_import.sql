-- Vérifications chiffrées de l'import initial. Lecture seule.
-- Valeurs attendues : comptées directement dans les CSV du 8 novembre 2026
-- (pharmacies_final.csv 802, pharmacies_en_attente_position.csv 3 138, pharmacies_interne.csv 802,
--  medicaments_test.csv 40). Si les fichiers changent, mettre ces valeurs à jour.
-- Échoue (code de sortie non nul) si un chiffre diffère.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
\pset footer off
BEGIN;  -- annulée à la fin : rien n'est écrit, la table de travail disparaît.

CREATE TEMP TABLE v (n serial, controle text, attendu bigint, obtenu bigint) ON COMMIT DROP;

INSERT INTO v (controle, attendu, obtenu) VALUES
-- Volumes
('pharmacies au total',                              3940, (SELECT count(*) FROM annuaire.pharmacie)),
('  dont fichier final (position confirmée)',          802, (SELECT count(*) FROM annuaire.pharmacie WHERE position_confirmee)),
('  dont en attente (position non confirmée)',        3138, (SELECT count(*) FROM annuaire.pharmacie WHERE NOT position_confirmee)),
-- Statuts
('statut pret_a_publier',                              755, (SELECT count(*) FROM annuaire.pharmacie WHERE statut_publication = 'pret_a_publier')),
('statut a_relire (nom de personne)',                   47, (SELECT count(*) FROM annuaire.pharmacie WHERE statut_publication = 'a_relire')),
('statut en_attente_position',                        2455, (SELECT count(*) FROM annuaire.pharmacie WHERE statut_publication = 'en_attente_position')),
('statut non_publiable',                               683, (SELECT count(*) FROM annuaire.pharmacie WHERE statut_publication = 'non_publiable')),
('statut publiee (rien de publié)',                      0, (SELECT count(*) FROM annuaire.pharmacie WHERE statut_publication = 'publiee')),
('lignes visibles dans publique.pharmacie',              0, (SELECT count(*) FROM publique.pharmacie)),
('nom_a_verifier vrai',                                 47, (SELECT count(*) FROM annuaire.pharmacie WHERE nom_a_verifier)),
('a_relire avec position confirmée',                    47, (SELECT count(*) FROM annuaire.pharmacie WHERE statut_publication = 'a_relire' AND position_confirmee)),
-- Positions
('pharmacies avec position',                           876, (SELECT count(*) FROM annuaire.pharmacie WHERE latitude IS NOT NULL)),
('  en attente avec position non confirmée',            74, (SELECT count(*) FROM annuaire.pharmacie WHERE latitude IS NOT NULL AND NOT position_confirmee)),
('source_gps tunidoc',                                 702, (SELECT count(*) FROM annuaire.pharmacie WHERE source_gps = 'tunidoc')),
('source_gps osm_telephone (100 final + 73 attente)',  173, (SELECT count(*) FROM annuaire.pharmacie WHERE source_gps = 'osm_telephone')),
('  dont publiables à terme (fichier final)',          100, (SELECT count(*) FROM annuaire.pharmacie WHERE source_gps = 'osm_telephone' AND position_confirmee)),
('source_gps osm_nom_ville',                             1, (SELECT count(*) FROM annuaire.pharmacie WHERE source_gps = 'osm_nom_ville')),
('precision_gps exact',                                875, (SELECT count(*) FROM annuaire.pharmacie WHERE precision_gps = 'exact')),
('precision_gps inconnu',                             3064, (SELECT count(*) FROM annuaire.pharmacie WHERE precision_gps = 'inconnu')),
('historique_position : une ligne par position',       876, (SELECT count(*) FROM annuaire.historique_position)),
('historique_position avec motif d''import',           876, (SELECT count(*) FROM annuaire.historique_position WHERE motif = 'import initial des CSV')),
-- Téléphones, gouvernorats, noms
('final sans téléphone (« Téléphone non renseigné »)', 596, (SELECT count(*) FROM annuaire.pharmacie WHERE position_confirmee AND telephone_principal IS NULL)),
('en attente sans téléphone',                          182, (SELECT count(*) FROM annuaire.pharmacie WHERE NOT position_confirmee AND telephone_principal IS NULL)),
('téléphones secondaires (final)',                      43, (SELECT coalesce(sum(cardinality(telephones_autres)), 0) FROM annuaire.pharmacie WHERE position_confirmee)),
('téléphones secondaires (en attente)',                539, (SELECT coalesce(sum(cardinality(telephones_autres)), 0) FROM annuaire.pharmacie WHERE NOT position_confirmee)),
('sans gouvernorat (tous en attente)',                  88, (SELECT count(*) FROM annuaire.pharmacie WHERE gouvernorat_code IS NULL AND NOT position_confirmee)),
('sans gouvernorat dans le fichier final',               0, (SELECT count(*) FROM annuaire.pharmacie WHERE gouvernorat_code IS NULL AND position_confirmee)),
('sans nom (tous non_publiable)',                      683, (SELECT count(*) FROM annuaire.pharmacie WHERE nom IS NULL AND statut_publication = 'non_publiable')),
('sans nom ailleurs',                                    0, (SELECT count(*) FROM annuaire.pharmacie WHERE nom IS NULL AND statut_publication <> 'non_publiable')),
('a_verifier vrai',                                   1326, (SELECT count(*) FROM annuaire.pharmacie WHERE a_verifier)),
('garde jour',                                        1495, (SELECT count(*) FROM annuaire.pharmacie WHERE garde = 'jour')),
('garde nuit',                                         292, (SELECT count(*) FROM annuaire.pharmacie WHERE garde = 'nuit')),
-- Sources
('source tunidoc (final)',                             701, (SELECT count(*) FROM annuaire.pharmacie WHERE 'tunidoc' = ANY (sources))),
('source goafricaonline (139 + 1 160)',               1299, (SELECT count(*) FROM annuaire.pharmacie WHERE 'goafricaonline' = ANY (sources))),
('source medtn (152 + 1 635)',                        1787, (SELECT count(*) FROM annuaire.pharmacie WHERE 'medtn' = ANY (sources))),
('source pdf (118 + 1 526)',                          1644, (SELECT count(*) FROM annuaire.pharmacie WHERE 'pdf' = ANY (sources))),
-- Horaires
('fiches avec horaires texte',                         701, (SELECT count(*) FROM annuaire.pharmacie WHERE horaires_texte IS NOT NULL)),
('plages horaires structurées',                       4907, (SELECT count(*) FROM annuaire.horaire)),
('fiches avec horaires sans plage',                      0, (SELECT count(*) FROM annuaire.pharmacie p WHERE horaires_texte IS NOT NULL
                                                             AND NOT EXISTS (SELECT 1 FROM annuaire.horaire h WHERE h.pharmacie_id = p.id))),
('horaires reconstruits = texte d''origine',          701, (SELECT count(*) FROM annuaire.pharmacie p WHERE p.horaires_texte = (
                                                               SELECT string_agg((ARRAY['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'])[h.jour + 1]
                                                                                 || ' ' || to_char(h.ouverture, 'HH24:MI') || '-' || to_char(h.fermeture, 'HH24:MI'),
                                                                                 ' ; ' ORDER BY (h.jour + 6) % 7, h.ouverture)
                                                               FROM annuaire.horaire h WHERE h.pharmacie_id = p.id))),
('plages du dimanche (jour 0)',                       (SELECT count(*) FROM annuaire.pharmacie WHERE horaires_texte ~ 'Sunday'),
                                                       (SELECT count(*) FROM annuaire.horaire WHERE jour = 0)),
-- Données internes
('pharmacie_interne (une par fiche finale)',           802, (SELECT count(*) FROM prive.pharmacie_interne i JOIN annuaire.pharmacie p ON p.id = i.pharmacie_id WHERE p.position_confirmee)),
('pharmacie_interne hors fichier final',                 0, (SELECT count(*) FROM prive.pharmacie_interne i JOIN annuaire.pharmacie p ON p.id = i.pharmacie_id WHERE NOT p.position_confirmee)),
('nom_est_nom_de_personne vrai',                        47, (SELECT count(*) FROM prive.pharmacie_interne WHERE nom_est_nom_de_personne)),
('  cohérent avec nom_a_verifier',                      47, (SELECT count(*) FROM prive.pharmacie_interne i JOIN annuaire.pharmacie p ON p.id = i.pharmacie_id
                                                             WHERE i.nom_est_nom_de_personne AND p.nom_a_verifier)),
('pharmacien_nom renseigné',                           177, (SELECT count(*) FROM prive.pharmacie_interne WHERE pharmacien_nom IS NOT NULL)),
('osm_id renseigné',                                   100, (SELECT count(*) FROM prive.pharmacie_interne WHERE osm_id IS NOT NULL)),
('  dont type a (surface, migration 023)',               3, (SELECT count(*) FROM prive.pharmacie_interne WHERE osm_id LIKE 'a%')),
('osm_id ⇔ position OSM',                              100, (SELECT count(*) FROM prive.pharmacie_interne i JOIN annuaire.pharmacie p ON p.id = i.pharmacie_id
                                                             WHERE i.osm_id IS NOT NULL AND p.source_gps = 'osm_telephone')),
-- Médicaments et référentiel
('médicaments',                                         40, (SELECT count(*) FROM annuaire.medicament)),
('  marqués donnée de test',                            40, (SELECT count(*) FROM annuaire.medicament WHERE donnee_test)),
('  visibles dans publique.medicament',                 40, (SELECT count(*) FROM publique.medicament)),
('gouvernorats (inchangés)',                            24, (SELECT count(*) FROM annuaire.gouvernorat)),
-- Tables qui doivent rester vides
('comptes, stocks, alertes, rattachements',              0, (SELECT (SELECT count(*) FROM prive.utilisateur) + (SELECT count(*) FROM annuaire.stock)
                                                             + (SELECT count(*) FROM prive.alerte) + (SELECT count(*) FROM prive.rattachement_pharmacien)));

SELECT n AS "n°", controle AS "contrôle", attendu, obtenu,
       CASE WHEN attendu = obtenu THEN 'OK' ELSE 'ÉCART' END AS "résultat"
FROM v ORDER BY n;

SELECT 'Bilan : ' || count(*) FILTER (WHERE attendu = obtenu) || ' / ' || count(*) || ' contrôles conformes.' AS bilan FROM v;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM v WHERE attendu IS DISTINCT FROM obtenu;
  IF n > 0 THEN RAISE EXCEPTION '% écart(s) entre les CSV et la base.', n; END IF;
END $$;

ROLLBACK;
