-- 029 : routes publiques de l'API (Partie 6, recherche et carte).
-- (028 est réservée à la règle R9 sur prive.demande_position, Partie 8.)
--
-- 1. mawjoud_api peut prendre le rôle mawjoud_lecture_publique (SET ROLE) sans hériter de ses droits.
--    Les routes publiques s'exécutent dans une transaction en lecture seule, sous ce rôle : la base
--    garantit qu'elles ne lisent que les vues publique.* et qu'elles n'écrivent rien.
-- 2. Index (latitude, longitude) sur les seules fiches publiées : la boîte englobante de la carte et
--    de la recherche par distance l'utilise à travers la vue publique.pharmacie (security_barrier).
--    Les comparaisons >= et <= sur double precision sont « leakproof » et traversent la vue ;
--    l'opérateur <@ de l'index GiST pharmacie_carte ne l'est pas, d'où ce second index.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('029', '029_lecture_publique_api');

-- Rôles communs au serveur : sans effet si l'appartenance existe déjà (mawjoud_test).
GRANT mawjoud_lecture_publique TO mawjoud_api WITH INHERIT FALSE, SET TRUE;

CREATE INDEX pharmacie_publiee_position ON annuaire.pharmacie (latitude, longitude)
  WHERE statut_publication = 'publiee';

COMMIT;
