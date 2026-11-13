# Base de données Mawjoud

SQL pur sur PostgreSQL 16. Le back-end (NestJS, dossier `backend/`) y accède avec `pg` et des requêtes paramétrées, sans ORM. Modèle et dictionnaire des tables : `docs/MODELE_DONNEES.md`. Décisions : `docs/DECISIONS_BASE_DE_DONNEES.md`.

## Règles

- **Les migrations font foi.** Un fichier déjà appliqué ne se modifie jamais : toute évolution passe par un nouveau fichier, numéroté à la suite.
- **Un sujet par fichier**, dans une transaction (`BEGIN` … `COMMIT`). La première instruction inscrit la migration dans `schema_migrations` : relancer un fichier déjà passé échoue tout de suite, sans rien changer.
- **Applicable avec `psql` seul.** Chaque fichier commence par `\set ON_ERROR_STOP on` et `SET client_encoding = 'UTF8'`.
- **`schema.sql` est une copie générée** par `pg_dump --schema-only` après chaque migration. Il ne se modifie jamais à la main.
- **Aucun mot de passe ici.** La connexion vient de `DATABASE_URL`, dans `.env` à la racine, ignoré par Git.

## Schémas

| Schéma | Contenu | Accès |
|---|---|---|
| `annuaire` | Gouvernorats, pharmacies, horaires, historique des positions, médicaments, stocks | Application |
| `prive` | Comptes, sessions, jetons, données internes des pharmacies, rattachements, demandes, alertes, e-mails, signalements, contact, journal | Application seulement |
| `publique` | Vues publiques | Lecture publique et application |

## Ordre des migrations

| N° | Fichier | Sujet |
|---|---|---|
| 001 | `001_schema_migrations.sql` | Registre des migrations |
| 002 | `002_extensions.sql` | `unaccent` et `pg_trgm` (accord donné) |
| 003 | `003_schemas_et_fonctions.sql` | Schémas `annuaire`, `prive`, `publique` ; fonctions `normaliser`, `maj_updated_at`, `interdire_modification` |
| 004 | `004_gouvernorat.sql` | Les 24 gouvernorats |
| 005 | `005_utilisateur.sql` | Comptes et contrôle des rôles |
| 006 | `006_session_et_jeton.sql` | Sessions et jetons (vérification d'e-mail, désabonnement) |
| 007 | `007_pharmacie.sql` | Pharmacies, publiées ou en attente |
| 008 | `008_pharmacie_interne.sql` | Traçabilité interne (noms de pharmaciens, sources) |
| 009 | `009_horaire.sql` | Horaires structurés |
| 010 | `010_rattachement_pharmacien.sql` | Rattachement pharmacien-pharmacie |
| 011 | `011_demande_position.sql` | Positions proposées par les pharmaciens |
| 012 | `012_historique_position.sql` | Historique des positions et déclencheur |
| 013 | `013_medicament.sql` | Catalogue des médicaments |
| 014 | `014_stock.sql` | Stock déclaré, contrôle du déclarant, historique |
| 015 | `015_alerte.sql` | Alertes de disponibilité |
| 016 | `016_envoi_email.sql` | File des e-mails |
| 017 | `017_signalement.sql` | Signalements d'erreur sur une fiche |
| 018 | `018_message_contact.sql` | Messages du formulaire Contact |
| 019 | `019_journal_audit.sql` | Journal d'audit |
| 020 | `020_vues_publiques.sql` | Vues publiques |
| 021 | `021_roles.sql` | Rôles `mawjoud_lecture_publique` et `mawjoud_application` |
| 022 | `022_statut_pret_a_publier.sql` | Statut `pret_a_publier` : fiche complète en attente de l'autorisation des sources |
| 023 | `023_osm_id_area.sql` | `osm_id` de type `a` (surface), gardé tel que dans l'export OSM |
| 024 | `024_connexion_base.sql` | Droit de connexion retiré à `PUBLIC`, donné aux rôles `mawjoud_application` et `mawjoud_lecture_publique` |
| 025 | `025_role_api.sql` | Compte de connexion `mawjoud_api` du back-end, membre de `mawjoud_application`, sans superutilisateur ; sans mot de passe dans la migration |
| 026 | `026_comptes_authentification.sql` | Jeton de réinitialisation du mot de passe, e-mails de compte, actions du journal (connexions, mots de passe, création d'administrateur) |
| 027 | `027_compte_suspendu.sql` | Un compte suspendu ne propose ni ne change de position, ni ne demande de rattachement (le stock l'était déjà, 014) |
| 028 | `028_r9_demande_position.sql` | R9 : un pharmacien ne propose une position que pour sa pharmacie (rattachement validé). Écrite en Partie 8, indépendante de 029 à 033 (appliquée après elles sur `mawjoud`) |
| 029 | `029_lecture_publique_api.sql` | `mawjoud_api` peut prendre le rôle `mawjoud_lecture_publique` (sans hériter de ses droits) pour l'API publique ; index (latitude, longitude) des fiches publiées |
| 030 | `030_analyser_annuaire.sql` | `annuaire.analyser_annuaire()` : ANALYZE de l'annuaire par l'application (SECURITY DEFINER, sans paramètre, exécutable par `mawjoud_application` seulement) |
| 031 | `031_espace_pharmacien.sql` | Retrait d'une déclaration de stock vérifié par la base (acteur : le pharmacien rattaché ou un administrateur) ; actions du journal `modifier_fiche`, `retirer_declaration`, `acces_refuse` |
| 032 | `032_droits_fiche_et_transitions.sql` | `mawjoud_api` sans `INSERT` ni `DELETE` sur `annuaire.pharmacie`, `UPDATE` par colonne ; modifications de fiche et d'horaires contrôlées par la base (acteur obligatoire, pharmacien limité à sa pharmacie et à téléphones, garde, horaires) ; transitions de statut en liste blanche (`annuaire.transition_publication_autorisee`) |
| 033 | `033_demandes_position.sql` | Demandes de position en ajout seul (seule la décision s'enregistre, une fois), statut `remplacee` ; actions du journal `proposer_position`, `relire_nom`, `changer_statut` |

L'ordre suit les dépendances : une table vient après celles qu'elle référence.

## Application

Script : `database/appliquer-migrations.ps1`, à lancer depuis la racine du dépôt.

```powershell
.\database\appliquer-migrations.ps1 -Lister      # état : appliquées et en attente, sans rien changer
.\database\appliquer-migrations.ps1 -CreerBase   # crée la base si besoin, puis applique
.\database\appliquer-migrations.ps1              # applique les fichiers absents de schema_migrations
```

- Lit `DATABASE_URL` dans `.env`. Le mot de passe passe à `psql` par `PGPASSWORD`, jamais en argument ni à l'écran.
- Refuse les bases `cleanapp`, `postgres`, `template0` et `template1` comme cible.
- Applique dans l'ordre des numéros, s'arrête à la première erreur (la transaction du fichier fautif est annulée).
- Régénère `schema.sql` après chaque application (`pg_dump --schema-only --no-owner`, clé `\restrict` fixe pour un fichier stable). `-SansSchema` l'évite.

**État** : base `mawjoud` créée le 13 novembre 2026 (UTF8), migrations 001 à 033 appliquées (028 écrite en Partie 8, après 029 à 031 sur `mawjoud`), contrôles de comportement réussis (contraintes de publication, bornes de la Tunisie, téléphones, historique des positions, déclarant du stock, droits des rôles). Données importées le 13 novembre 2026 (voir ci-dessous).

Les fonctions communes (lecture de `.env`, variables `PG*`) sont dans `database/connexion-pg.ps1`. Les scripts n'acceptent que deux bases : `mawjoud` et `mawjoud_test` (et refusent toujours `cleanapp`, `postgres`, `template0`, `template1`).

## Compte du back-end et base de test

```powershell
.\database\definir-mot-de-passe-api.ps1             # mot de passe de mawjoud_api -> .env (API_DATABASE_URL)
.\database\definir-mot-de-passe-api.ps1 -Remplacer  # le changer
.\database\preparer-base-test.ps1                  # recrée mawjoud_test, vide, avec toutes les migrations
.\database\appliquer-migrations.ps1 -BaseTest      # migrations sur mawjoud_test seulement
```

- `definir-mot-de-passe-api.ps1` : mot de passe aléatoire de 256 bits, jamais affiché ; le serveur ne reçoit que son empreinte SCRAM-SHA-256, calculée par le script ; seule la ligne `API_DATABASE_URL` de `.env` est écrite. `DATABASE_URL` (compte `postgres`) reste réservée aux scripts.
- `preparer-base-test.ps1` crée aussi le rôle `mawjoud_test_fixtures` (sans connexion), avec `INSERT` sur `annuaire.pharmacie`, `annuaire.horaire` et `annuaire.historique_position` **dans `mawjoud_test` seulement**, et permet à `mawjoud_api` de le prendre (`SET ROLE`, sans hériter) : depuis 032, `mawjoud_api` ne peut plus créer de fiche, et les tests créent les leurs avec ce rôle. Dans `mawjoud`, il n'a aucun droit.
- `preparer-base-test.ps1` ne vise que la base nommée exactement `mawjoud_test` ; `npm test` (dans `backend`) le lance avant les tests. `schema.sql` n'est jamais régénéré depuis cette base.
- Les rôles sont communs au serveur : 025 crée `mawjoud_api` une fois et le retrouve dans `mawjoud_test`.
- Une nouvelle table créée par une migration doit recevoir ses droits explicitement (`GRANT … TO mawjoud_application`) : 021 ne couvre que les tables existantes à son passage.

## Connexion à la base (migration 024)

Seuls se connectent à la base : le superutilisateur, le propriétaire, et les comptes membres de `mawjoud_application` ou `mawjoud_lecture_publique`. Ces deux rôles de groupe n'ont pas de connexion propre (`NOLOGIN`) : le back-end utilisera un compte de connexion membre de l'un d'eux. Tout autre compte du serveur (par exemple celui d'un autre projet) est refusé avec « L'utilisateur n'a pas le droit CONNECT ». Vérifié le 13 novembre 2026 avec des rôles de test temporaires, supprimés ensuite.

Ce droit porte sur la base elle-même : `pg_dump --schema-only` ne l'écrit pas dans `schema.sql`. Il n'est visible que dans la migration 024.

## Import des données

Script : `database/importer-donnees.ps1`, à lancer depuis la racine du dépôt, après les migrations.

```powershell
.\database\importer-donnees.ps1                     # import, puis vérifications chiffrées
.\database\importer-donnees.ps1 -VerifierSeulement  # vérifications seules, sans écriture
```

- Lit les CSV hors du dépôt : `../data/final/pharmacies_final.csv`, `pharmacies_en_attente_position.csv`, `pharmacies_interne.csv` et `../data/medicaments_test.csv` (`-DossierDonnees` et `-Medicaments` pour d'autres chemins). Les CSV ne vont jamais dans Git.
- `import/importer.sql` : `\copy` vers des tables temporaires, contrôles bloquants (identifiants en double, nom et code de gouvernorat, booléens, plages horaires lisibles), puis `INSERT … SELECT` avec les conversions de `docs/MODELE_DONNEES.md`. Une seule transaction : à la moindre erreur, rien n'est écrit. Refusé si la base contient déjà des pharmacies ou des médicaments.
- `import/verifier_import.sql` : 54 contrôles chiffrés, comparés aux comptes faits directement dans les CSV ; échoue au moindre écart. À mettre à jour si les fichiers changent.
- Aucune ligne de données n'est affichée, seulement des comptes.

Résultat du 13 novembre 2026 : 3 940 pharmacies (755 `pret_a_publier`, 47 `a_relire`, 2 455 `en_attente_position`, 683 `non_publiable`, aucune `publiee`), 4 907 plages horaires, 876 positions historisées, 802 fiches internes, 40 médicaments de test. 54 contrôles sur 54 conformes.

## Pour le back-end, quand il sera choisi

- Requêtes paramétrées uniquement, jamais de texte concaténé.
- Les valeurs sont en snake_case en base (`quantite_limitee`) et à tirets dans le front-end (`quantite-limitee`) : l'API convertit. Table de correspondance dans `docs/MODELE_DONNEES.md`.
- Avant de changer une position existante, dans la même transaction : `SET LOCAL mawjoud.motif_position = '…'`. Facultatifs : `mawjoud.acteur_id` et `mawjoud.demande_position_id`. Sans motif, la base refuse la modification.
- « À confirmer » se calcule à la lecture (`declare_le` plus vieux que 24 h) : il n'est jamais stocké.
- Les jetons et identifiants de session sont stockés sous forme d'empreinte SHA-256, jamais en clair.
