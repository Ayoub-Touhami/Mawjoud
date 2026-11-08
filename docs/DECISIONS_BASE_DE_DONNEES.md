# Décisions : base de données et back-end de Mawjoud

Choix validés par l'équipe lors du cadrage du 8 novembre 2026, puis révisés le même jour (back-end non choisi, SQL pur, migrations avec `psql` seul). Chaque choix a été présenté avec ses avantages, ses inconvénients et une recommandation avant d'être retenu.

## Principe : une base indépendante du back-end

Le langage du back-end n'est pas encore choisi. La base est donc conçue pour ne dépendre d'aucun langage :

- **SQL pur sur PostgreSQL.** Pas d'ORM, pas de Prisma.
- **Schéma en fichiers `.sql` versionnés** dans un dossier dédié (`database/`) : un fichier `schema.sql` et des migrations numérotées (`001_…sql`, `002_…sql`).
- **Migrations applicables avec `psql` seul**, sans outil lié à un langage. **Les migrations font foi.**
- **`schema.sql` est une copie générée** par `pg_dump --schema-only` après chaque migration. Il ne se modifie jamais à la main.
- **Table `schema_migrations`** : elle enregistre chaque migration déjà appliquée (numéro, nom du fichier, date d'application). Une migration ne passe qu'une fois.
- **Script PowerShell d'application** : il lit `DATABASE_URL` dans `.env`, compare les fichiers de migrations à `schema_migrations`, puis applique avec `psql`, dans l'ordre des numéros, seulement les fichiers pas encore passés. Chaque migration s'exécute dans une transaction et s'arrête à la première erreur. Le script n'affiche jamais le mot de passe.
- **Import des CSV en SQL**, avec `COPY` ou `\copy` de `psql`, éventuellement un petit script d'appui, jamais du code propre à un framework.
- **Accès futur du back-end** par une bibliothèque PostgreSQL et des **requêtes paramétrées uniquement**, jamais de concaténation de texte dans une requête SQL. Non implémenté pour l'instant.
- **`.env`** ne contient que les paramètres de connexion à PostgreSQL (`DATABASE_URL`), sans rien qui dépende d'un langage.

## Choix techniques

| Sujet | Décision | Raison principale |
|---|---|---|
| Back-end | **Langage et framework à décider.** NestJS (TypeScript) reste une hypothèse provisoire, qui peut changer. Rien ne doit enfermer le projet dans NestJS. | Le choix se fera plus tard ; la base reste utilisable par n'importe quel langage. |
| Base de données | **PostgreSQL 16**, base `mawjoud` | Déjà installé et prévu dans `CLAUDE.md`. La base `cleanapp` appartient à un autre projet : ne pas y toucher. |
| Accès à la base et migrations | **SQL pur, migrations en fichiers `.sql`** appliquées avec `psql` seul, suivies par la table `schema_migrations` et un script PowerShell ; pas d'outil de migrations (dbmate écarté pour l'instant) | Indépendant du langage ; chaque requête reste visible et maîtrisée. La recherche tolérante aux fautes utilise l'extension `pg_trgm`, fournie avec PostgreSQL. |
| Position des pharmacies | **Colonnes latitude et longitude**, avec index et contrôle des bornes de la Tunisie | Suffisant pour quelques milliers de pharmacies, disponible partout. PostGIS reste possible plus tard. |
| Connexion des utilisateurs | **Sessions** stockées dans PostgreSQL, cookie HttpOnly, protection CSRF | Une suspension ou une suppression de compte prend effet immédiatement ; aucun jeton gardé dans le navigateur. La table des sessions fait partie du schéma ; la gestion des sessions sera réalisée côté back-end une fois le langage choisi. |
| Mots de passe | **argon2id** | Premier choix des recommandations OWASP. La base stocke seulement l'empreinte ; le hachage sera réalisé côté back-end une fois le langage choisi. |
| E-mails | Développement : **console**, ou **Mailpit** (à installer seulement avec accord). Production : **Brevo** | Rien ne sort du PC pendant le développement. Production soumise au choix de l'hébergement et d'un nom de domaine (SPF, DKIM). |
| Catalogue de médicaments | **Nomenclature officielle tunisienne (DPM)**, avec nom commercial, DCI, forme et dosage | Après vérification de l'accès et de la licence. Les 40 médicaments de test restent en attendant. Pas de saisie libre : les alertes demandent un médicament identifié. |

## Données des pharmacies

- **Import réel, site en test.** Les 802 pharmacies de `pharmacies_final.csv` sont importées, mais le site n'est pas publié et garde la bande « données de test » tant que les autorisations de publication (Tunidoc, goafricaonline, medtn, PDF) ne sont pas obtenues.
- **Règle d'affichage.** Une pharmacie n'apparaît sur le site que si sa position est confirmée.
- **Pharmacies en attente.** Les 3 138 lignes de `pharmacies_en_attente_position.csv` sont importées dans un état non public, pour qu'un pharmacien retrouve sa fiche et la réclame. Avant toute publication : gouvernorat obligatoire (88 manquants), contrôle des numéros partagés et des parapharmacies possibles par l'administrateur. Elles entrent sur le site quand le pharmacien place sa position et que l'administrateur la valide.
- **Téléphone manquant.** 596 des 802 pharmacies n'ont pas de téléphone : elles restent affichées avec « Téléphone non renseigné », sans bouton « Appeler », avec « Itinéraire ». Le front-end doit être adapté.
- **OpenStreetMap.** Les positions issues d'OpenStreetMap (100 dans le fichier final, 74 en attente) sont gardées. La source de chaque position est enregistrée, la mention « © OpenStreetMap contributors » est affichée, et l'obligation de partage de la licence ODbL est vérifiée avant toute publication.
- **Données internes.** `pharmacies_interne.csv` (noms de pharmaciens, sources) ne va jamais dans les tables publiques.
- **Positions.** Un GPS existant n'est jamais écrasé : toute correction (pharmacien, administrateur) est historisée.

## Règles de sécurité

- `DATABASE_URL` uniquement dans `.env` à la racine, ignoré par Git. `.env` doit être ajouté au `.gitignore` **avant** la création du fichier : il ne l'est pas encore.
- Aucun mot de passe, clé ou jeton dans le code ni dans un fichier suivi par Git.
- Requêtes SQL toujours paramétrées.
- Les droits sont contrôlés par le serveur : un pharmacien ne modifie que sa pharmacie, l'administration est réservée.

## À faire, découlant de ces choix

- Base : dossier `database/` avec les migrations numérotées, la table `schema_migrations`, le script PowerShell d'application, `schema.sql` généré par `pg_dump --schema-only`, et les scripts d'import en `\copy`.
- Front-end : parcours « le pharmacien place sa position » et « l'administrateur la valide » ; affichage « Téléphone non renseigné ».
- Une fois le back-end choisi : remplacer les services simulés par des appels à l'API, sans changer les écrans ; sessions et argon2id ; déclenchement des alertes avec un seul e-mail par disponibilité et nouvelle tentative en cas d'échec ; dépôt des justificatifs ; réception des messages de contact.
- Convertir les horaires texte (701 fiches) au format du front-end.
- Ajouter la traçabilité des 3 138 pharmacies en attente : `pharmacies_interne.csv` ne couvre que les 802 du fichier final.
- Corriger `LISEZMOI_donnees.md`, dont la première partie parle encore d'afficher 3 257 pharmacies.
- Noter dans `STATUT.md` que la règle de position confirmée remplace « toutes les pharmacies sont visibles » (spécification, section 15.1).

## Points encore ouverts

- **Langage et framework du back-end.**
- Hébergement et nom de domaine.
- Autorisations de publication des sources web ; loi tunisienne sur les données personnelles (INPDP).
- Méthode de vérification des pharmaciens ; mot de passe oublié ; historique des déclarations ; plusieurs pharmacies par compte ; ville pilote.
- Accès réel et licence de la nomenclature des médicaments.
