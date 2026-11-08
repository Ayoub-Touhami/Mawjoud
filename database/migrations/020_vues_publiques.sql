-- 020 : vues publiques. Seule porte des requêtes publiques : aucune ne lit prive.pharmacie_interne,
-- aucune ne renvoie d'e-mail, d'identifiant de compte ni de clé numérique interne.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('020', '020_vues_publiques');

-- « Inscrite » = un pharmacien vérifié et non suspendu. Écrit dans chaque vue, et non dans une fonction :
-- une vue lit les tables avec les droits de son propriétaire, une fonction avec ceux de l'appelant,
-- qui n'a aucun accès au schéma prive.

CREATE VIEW publique.gouvernorat AS
  SELECT code, nom FROM annuaire.gouvernorat;

CREATE VIEW publique.pharmacie WITH (security_barrier) AS
  SELECT p.uuid AS id,
         p.nom, p.rue, p.quartier, p.ville, p.code_postal,
         p.gouvernorat_code, g.nom AS gouvernorat,
         p.telephone_principal, p.telephones_autres,
         p.latitude, p.longitude,
         p.source_gps,      -- pour la mention « © OpenStreetMap contributors »
         p.garde,
         CASE
           WHEN EXISTS (SELECT 1
                         FROM prive.rattachement_pharmacien r
                         JOIN prive.utilisateur u ON u.id = r.utilisateur_id
                        WHERE r.pharmacie_id = p.id AND r.statut = 'validee' AND NOT u.suspendu) THEN 'inscrite'
           WHEN EXISTS (SELECT 1 FROM prive.rattachement_pharmacien r
                         WHERE r.pharmacie_id = p.id AND r.statut = 'en_attente') THEN 'reclamee'
           ELSE 'non_inscrite'
         END AS etat,
         p.updated_at
    FROM annuaire.pharmacie p
    JOIN annuaire.gouvernorat g ON g.code = p.gouvernorat_code
   WHERE p.statut_publication = 'publiee';

CREATE VIEW publique.horaire WITH (security_barrier) AS
  SELECT p.uuid AS pharmacie_id, h.jour, h.ouverture, h.fermeture
    FROM annuaire.horaire h
    JOIN annuaire.pharmacie p ON p.id = h.pharmacie_id
   WHERE p.statut_publication = 'publiee';

CREATE VIEW publique.medicament AS
  SELECT uuid AS id, code_source, nom_commercial, dci, forme, dosage, categorie, nom_ar, dci_ar, donnee_test
    FROM annuaire.medicament
   WHERE actif;

-- R7 : aucun stock pour une pharmacie non inscrite. Le statut reste un mot ; « à confirmer » se calcule.
CREATE VIEW publique.stock WITH (security_barrier) AS
  SELECT p.uuid AS pharmacie_id, m.uuid AS medicament_id, s.statut, s.declare_le
    FROM annuaire.stock s
    JOIN annuaire.pharmacie p  ON p.id = s.pharmacie_id
    JOIN annuaire.medicament m ON m.id = s.medicament_id
   WHERE s.statut IS NOT NULL
     AND p.statut_publication = 'publiee'
     AND m.actif
     AND EXISTS (SELECT 1
              FROM prive.rattachement_pharmacien r
              JOIN prive.utilisateur u ON u.id = r.utilisateur_id
             WHERE r.pharmacie_id = p.id AND r.statut = 'validee' AND NOT u.suspendu);

COMMIT;
