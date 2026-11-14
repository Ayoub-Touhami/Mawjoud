-- 037 : formulaire de contact (Partie 10c).
--
-- POST /api/v1/contact enregistre le message dans prive.message_contact (aucun e-mail envoyé). La migration 036
-- avait retiré ce droit tant que le formulaire n'existait pas : il est rendu, colonne par colonne, pour les seules
-- colonnes saisies. Ni lecture des messages, ni modification, ni suppression par l'API (lecture réservée aux scripts
-- du serveur tant que l'écran d'administration des messages n'existe pas).
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('037', '037_contact');

GRANT INSERT (nom, email, sujet, message, pharmacie_id) ON prive.message_contact TO mawjoud_application;

COMMIT;
