# Mawjoud (موجود)

Plateforme web qui aide les Tunisiens à trouver une pharmacie proche et à savoir si un médicament y est disponible.

Projet en cours de développement. Cette version contient la recherche de pharmacies sur carte, la recherche de médicaments, les comptes (patient et pharmacie), la déclaration de stock par les pharmacies, les alertes de disponibilité et un espace d'administration.

| Dossier | Contenu |
|---|---|
| `frontend/` | Application Angular : pages, carte, traductions français / arabe |
| `backend/` | API NestJS : comptes, espace pharmacien, rattachements, alertes, administration, données publiques |
| `database/` | Migrations PostgreSQL (001 à 036), scripts PowerShell, jeu de données fictif |
| `docs/` | Documentation technique (base de données, API, sécurité) |


---

## 1. À installer (une seule fois)

| Logiciel | Version | Lien | Vérification dans un terminal |
|---|---|---|---|
| Git | récente | https://git-scm.com | `git --version` |
| Node.js (avec npm) | 24 ou plus | https://nodejs.org | `node -v` et `npm -v` |
| PostgreSQL (avec `psql`) | 16 | https://www.postgresql.org/download | `psql --version` |
| VS Code (conseillé) | récente | https://code.visualstudio.com | extension « Angular Language Service » |

Après une installation, fermer puis rouvrir VS Code et PowerShell pour que les commandes soient reconnues.

Conseil : placer le projet dans un chemin court (exemple : `C:\projets\mawjoud`).

## 2. Récupérer le projet (une seule fois)

Le propriétaire du dépôt doit d'abord ajouter son binôme sur GitHub : Settings › Collaborators › Add people. Le binôme accepte ensuite l'invitation reçue par e-mail.

```powershell
cd C:\projets
git clone https://github.com/Ayoub-Touhami/Mawjoud.git
cd Mawjoud
```

## 3. Créer la base de données (une seule fois)

1. Vérifier que le service PostgreSQL est démarré.
2. Copier le fichier `.env.example` en `.env` à la racine, puis renseigner `DATABASE_URL` avec le mot de passe de l'utilisateur `postgres` choisi à l'installation.
3. Dans PowerShell, à la racine du projet :

```powershell
.\database\appliquer-migrations.ps1 -CreerBase
.\database\definir-mot-de-passe-api.ps1
```

La base `mawjoud` est créée avec ses trois schémas (`annuaire`, `prive`, `publique`) et les 36 migrations sont appliquées. Chaque membre du binôme a sa propre base sur son PC : un compte créé chez l'un n'existe pas chez l'autre.

## 4. Installer le backend et charger les données fictives

```powershell
cd backend
npm ci
cd ..
.\database\jeu-fictif.ps1
```

`jeu-fictif.ps1` ajoute des pharmacies, des médicaments et des stocks inventés, ainsi que des comptes de démonstration. Les identifiants de ces comptes sont affichés à la fin de l'exécution du script.

## 5. Lancer le backend

```powershell
cd backend
npm run start:dev
```

Laisser ce terminal ouvert. L'API écoute sur http://localhost:3000.

En développement, les e-mails (vérification du compte, mot de passe oublié) ne sont pas envoyés : le lien apparaît dans ce terminal.

## 6. Lancer le frontend

Dans un deuxième terminal :

```powershell
cd frontend
npm ci
npm start
```

Ouvrir http://localhost:4200 : la carte et la liste des pharmacies s'affichent. Les appels `/api` sont redirigés vers le backend par `frontend/proxy.conf.json`.

## 7. Chaque séance de travail

1. Démarrer le service PostgreSQL.
2. Récupérer le travail du binôme : `git pull`.
3. Si `package.json` a changé : refaire `npm ci` dans le dossier concerné.
4. Terminal 1 : `cd backend` puis `npm run start:dev`.
5. Terminal 2 : `cd frontend` puis `npm start`.

Pour partager ses modifications :

```powershell
git add .
git commit -m "Description courte du changement"
git pull
git push
```

Règles pour éviter les conflits :
- toujours faire `git pull` avant de commencer et avant `git push` ;
- se répartir les fichiers ;
- faire de petits commits fréquents avec un message clair.

## 8. Problèmes fréquents

| Problème | Solution |
|---|---|
| `node`, `git` ou `psql` « n'est pas reconnu » | Installer le logiciel, puis fermer et rouvrir le terminal |
| « Les pharmacies n'ont pas pu être chargées » | Le backend n'est pas lancé (étape 5) |
| « Aucune pharmacie trouvée » | Le jeu de données n'a pas été chargé (étape 4) |
| `npm start` : `package.json` introuvable | Se placer dans `frontend/` (et dans `backend/` pour `npm run start:dev`) |
| Le port 3000 ou 4200 est déjà utilisé | Fermer l'autre terminal qui lance le projet, ou `npm start -- --port 4201` |
| « Trop de tentatives » à la connexion | Attendre quelques minutes : c'est la limitation anti-abus |
| Le lien de vérification n'arrive pas par e-mail | Normal en développement : le copier depuis le terminal du backend |
| Erreur de connexion à la base | Service PostgreSQL arrêté, ou `DATABASE_URL` incorrect dans `.env` |

---

## Choix du framework

| Couche | Choix | Pourquoi |
|---|---|---|
| Frontend | Angular (composants autonomes, routage intégré, formulaires réactifs) | Structure imposée qui garde le code propre à deux, pages protégées par des gardes de route, validation des formulaires |
| Backend | NestJS (Node.js, TypeScript) | Même langage que le frontend, architecture en modules, validation des données en entrée, documentation Swagger |
| Base de données | PostgreSQL 16 | Base relationnelle adaptée à des données liées (pharmacies, médicaments, stocks, comptes), contraintes et déclencheurs pour garantir la cohérence |
| Accès aux données | SQL paramétré avec `pg`, sans ORM | Requêtes maîtrisées et protégées contre les injections SQL |
| Carte | MapLibre + OpenFreeMap | Carte libre, sans clé d'API payante |
| Langues | Transloco | Interface en français et en arabe (de droite à gauche) |

## Fonctionnalités développées

| Fonctionnalité | Ce qu'on peut faire |
|---|---|
| Recherche de pharmacies | Liste et carte, filtres, recherche par nom ou par ville, tri par proximité |
| Recherche de médicaments | Catalogue de référence, pharmacies qui ont le médicament en stock |
| Comptes | Inscription et connexion pour un patient ou une pharmacie, vérification de l'adresse e-mail, mot de passe oublié |
| Espace pharmacie | Demande de rattachement à une pharmacie, déclaration et mise à jour du stock |
| Alertes | Un patient est prévenu par e-mail quand un médicament redevient disponible, avec lien de désabonnement |
| Administration | Validation des demandes, relecture et publication des fiches, journal d'audit (réservé aux administrateurs) |
| Interface | Responsive (ordinateur, tablette, mobile), français et arabe, accessibilité (focus clavier, libellés, contrastes) |

### Cycle de publication d'une pharmacie

Une fiche passe par les états : en attente de position › à relire › prête à publier › publiée. Elle peut aussi être non publiable, fermée ou fusionnée avec une autre. Les transitions interdites sont bloquées directement par la base de données.

### Sécurité

- mots de passe hachés avec argon2id, jamais stockés en clair ;
- sessions côté serveur dans des cookies `__Host-` (HttpOnly, SameSite=Strict) avec jeton CSRF ;
- limitation du nombre de tentatives (connexion, inscription, formulaires) ;
- requêtes SQL paramétrées, en-têtes de sécurité (helmet), CORS strict ;
- droits minimaux dans la base : deux rôles distincts avec accès limité colonne par colonne ;
- à l'inscription, le message est identique que l'e-mail existe déjà ou non (pas de fuite d'information) ;
- journal d'audit des actions sensibles ;
- les secrets sont dans `.env`, qui n'est jamais envoyé sur GitHub.

## Méthode de travail

Une branche par fonctionnalité, fusionnée dans `main` quand elle est terminée :

```powershell
git checkout main
git pull
git checkout -b feature/nom-de-la-fonctionnalite
git add .
git commit -m "Description courte"
git push -u origin feature/nom-de-la-fonctionnalite
```

Puis ouvrir une Pull Request sur GitHub vers `main`.

## Organisation du code

```
frontend/src/app/   core (services, traductions), layout, shared (composants réutilisables), pages
backend/src/        un module par domaine : comptes, pharmacien, rattachements, alertes, administration, publique, audit, email, contact, sécurité
database/           migrations/ (001 à 036), schema.sql, scripts PowerShell, jeu-fictif.ps1
docs/               documentation technique
```

## Documentation de l'API

Au lancement du backend en mode développement, la documentation interactive (Swagger) est disponible sur http://localhost:3000/api/docs. Elle liste toutes les routes et permet de les tester. Elle est désactivée en production.

## Prochaines étapes

| Fonctionnalité | Description |
|---|---|
| Hébergement | Mise en ligne du site et de l'API |
| E-mails réels | Envoi des e-mails par un fournisseur (Brevo) à la place de l'affichage dans le terminal |
| Positions manquantes | Géolocalisation des pharmacies encore sans position |
| Catalogue de médicaments | Relecture du catalogue par un pharmacien |
| Textes arabes | Relecture complète des traductions |
| Sauvegardes | Sauvegardes chiffrées de la base |
