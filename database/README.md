# Base de données Mawjoud

SQL pur sur PostgreSQL 16, indépendant du langage du back-end. Modèle et dictionnaire des tables : `docs/MODELE_DONNEES.md`. Décisions : `docs/DECISIONS_BASE_DE_DONNEES.md`.

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
| 002 | `002_extensions.sql` | `unaccent` et `pg_trgm` (accord donné ; appliquée à la partie 3) |
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

L'ordre suit les dépendances : une table vient après celles qu'elle référence.

## Application

Le script PowerShell qui applique dans l'ordre les fichiers absents de `schema_migrations` reste à écrire. En attendant, un fichier s'applique ainsi :

```powershell
psql $env:DATABASE_URL -f database/migrations/001_schema_migrations.sql
```

**Rien n'est appliqué pour l'instant** : ces fichiers attendent la validation du modèle.

## Pour le back-end, quand il sera choisi

- Requêtes paramétrées uniquement, jamais de texte concaténé.
- Les valeurs sont en snake_case en base (`quantite_limitee`) et à tirets dans le front-end (`quantite-limitee`) : l'API convertit. Table de correspondance dans `docs/MODELE_DONNEES.md`.
- Avant de changer une position existante, dans la même transaction : `SET LOCAL mawjoud.motif_position = '…'`. Facultatifs : `mawjoud.acteur_id` et `mawjoud.demande_position_id`. Sans motif, la base refuse la modification.
- « À confirmer » se calcule à la lecture (`declare_le` plus vieux que 24 h) : il n'est jamais stocké.
- Les jetons et identifiants de session sont stockés sous forme d'empreinte SHA-256, jamais en clair.
