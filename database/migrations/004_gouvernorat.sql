-- 004 : les 24 gouvernorats. Codes identiques à ceux des CSV et à la liste INS fournie par l'équipe ;
-- ils restent à confirmer avec une source officielle.
\set ON_ERROR_STOP on
SET client_encoding = 'UTF8';
BEGIN;
INSERT INTO public.schema_migrations (version, nom) VALUES ('004', '004_gouvernorat');

CREATE TABLE annuaire.gouvernorat (
  code smallint PRIMARY KEY CHECK (code BETWEEN 11 AND 83),
  nom  text     NOT NULL UNIQUE CHECK (nom <> '')
);
COMMENT ON TABLE annuaire.gouvernorat IS 'Référence des 24 gouvernorats. Les noms arabes restent dans les traductions du front-end.';

INSERT INTO annuaire.gouvernorat (code, nom) VALUES
  (11, 'Tunis'), (12, 'Ariana'), (13, 'Ben Arous'), (14, 'La Manouba'),
  (21, 'Nabeul'), (22, 'Zaghouan'), (23, 'Bizerte'),
  (31, 'Béja'), (32, 'Jendouba'), (33, 'Le Kef'), (34, 'Siliana'),
  (41, 'Kairouan'), (42, 'Kasserine'), (43, 'Sidi Bouzid'),
  (51, 'Sousse'), (52, 'Monastir'), (53, 'Mahdia'),
  (61, 'Sfax'),
  (71, 'Gafsa'), (72, 'Tozeur'), (73, 'Kébili'),
  (81, 'Gabès'), (82, 'Médenine'), (83, 'Tataouine');

COMMIT;
