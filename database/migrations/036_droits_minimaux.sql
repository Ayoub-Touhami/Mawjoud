-- 036 : droits minimaux de mawjoud_application (audit de la Partie 9d).
--
-- Chaque droit retiré n'est utilisé par aucune requête de l'API (src/ et scripts/ relus le 13 novembre 2026).
-- Une fonction future qui en aura besoin (formulaire de contact, signalement, suppression de compte, saisie du
-- catalogue) l'accordera dans sa propre migration, colonne par colonne si possible.
--
-- 1. Écritures inutilisées retirées : catalogue des médicaments (importé par les scripts du serveur), noms
--    internes des pharmaciens (aucun accès), signalements et messages (seule la fusion en change la pharmacie).
-- 2. UPDATE limité aux colonnes que l'API écrit (jamais prive.utilisateur.role, ni email, ni les identifiants).
-- 3. DELETE retiré là où l'API ne supprime rien (comptes, jetons, e-mails, rattachements). Les suppressions en
--    cascade (clés étrangères) se font avec les droits du propriétaire des tables : elles ne changent pas.
-- 4. Lecture de l'historique des positions retirée (seul son déclencheur y écrit).
-- 5. Plus de tables temporaires pour tout le monde (PUBLIC) sur la base.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('036', '036_droits_minimaux');

-- 1.
REVOKE INSERT, UPDATE, DELETE ON annuaire.medicament FROM mawjoud_application;
REVOKE ALL ON prive.pharmacie_interne FROM mawjoud_application;
REVOKE ALL ON prive.signalement, prive.message_contact FROM mawjoud_application;
-- Fusion de fiches (035) : les signalements et messages de la fiche fusionnée passent à la fiche conservée.
GRANT SELECT (uuid, pharmacie_id), UPDATE (pharmacie_id) ON prive.signalement, prive.message_contact TO mawjoud_application;

-- 2. et 3.
REVOKE UPDATE, DELETE ON prive.utilisateur FROM mawjoud_application;
GRANT UPDATE (email_verifie_le, mot_de_passe_hache, suspendu) ON prive.utilisateur TO mawjoud_application;

REVOKE UPDATE, DELETE ON prive.rattachement_pharmacien FROM mawjoud_application;
GRANT UPDATE (statut, pharmacie_id, conflit, motif_code, motif_precision, decide_par, decide_le)
  ON prive.rattachement_pharmacien TO mawjoud_application;

REVOKE UPDATE, DELETE ON prive.jeton FROM mawjoud_application;
GRANT UPDATE (expire_le, utilise_le) ON prive.jeton TO mawjoud_application;

REVOKE UPDATE, DELETE ON prive.envoi_email FROM mawjoud_application;
GRANT UPDATE (statut, envoye_le, tentatives, derniere_erreur, prochaine_tentative_le) ON prive.envoi_email TO mawjoud_application;

REVOKE UPDATE ON prive.session FROM mawjoud_application;
GRANT UPDATE (derniere_activite_le, donnees, expire_le) ON prive.session TO mawjoud_application;

REVOKE UPDATE ON prive.alerte FROM mawjoud_application;
GRANT UPDATE (statut, declenchee_le, declenchee_par_pharmacie, gouvernorat_code) ON prive.alerte TO mawjoud_application;

REVOKE UPDATE ON annuaire.stock FROM mawjoud_application;
GRANT UPDATE (statut, declare_le, declare_par) ON annuaire.stock TO mawjoud_application;

-- Les horaires se remplacent (suppression puis insertion) : jamais modifiés en place.
REVOKE UPDATE ON annuaire.horaire FROM mawjoud_application;

-- 4.
REVOKE SELECT ON annuaire.historique_position FROM mawjoud_application;

-- 5. (s'applique à la base où tourne la migration : mawjoud, ou mawjoud_test)
DO $$ BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
END $$;

COMMIT;
