# Mawjoud (موجود)

**Moins de tours, plus de secours.**

Mawjoud est un site tunisien qui montre sur une carte les pharmacies et la disponibilité des médicaments, déclarée par les pharmaciens eux-mêmes. Un patient cherche un médicament, voit les pharmacies qui l'ont (de la plus proche à la plus éloignée) et peut créer une alerte e-mail. Le site est bilingue français / arabe.

Projet web SUP'COM 2025/2026 : **Touhami AYOUB** et **Garma NOUR EL HOUDA**, sous l'encadrement de **Dr. Maroua Nouioua**.

> **Données.** Les données réelles (annuaire des pharmacies issu de sources publiques, noms et téléphones) **ne sont pas dans ce dépôt**. Après un clonage, la base est vide : le script `database/jeu-fictif.ps1` installe un jeu **entièrement inventé** pour essayer le site. Les données de test du front-end sont elles aussi fictives.

## Captures d'écran

| Accueil (carte) | Recherche | Fiche pharmacie | Espace pharmacien |
|---|---|---|---|
| *(capture à ajouter)* | *(capture à ajouter)* | *(capture à ajouter)* | *(capture à ajouter)* |

## Scores Lighthouse

| Page | Performance | Accessibilité | Bonnes pratiques | SEO |
|---|---|---|---|---|
| Accueil | *à remplir* | *à remplir* | *à remplir* | *à remplir* |
| Recherche | *à remplir* | *à remplir* | *à remplir* | *à remplir* |
| Fiche pharmacie | *à remplir* | *à remplir* | *à remplir* | *à remplir* |

## Technologies et choix

| Partie | Technologie | Pourquoi |
|---|---|---|
| Front-end | **Angular** (composants autonomes, signaux), Transloco, MapLibre GL JS + tuiles OpenFreeMap | Cadre complet et typé pour une application à plusieurs espaces (public, pharmacien, administration) ; bilingue avec passage en arabe de droite à gauche ; carte libre, sans clé ni coût. |
| Back-end | **NestJS** (TypeScript), `pg` en SQL pur (requêtes paramétrées, sans ORM), argon2 | Même langage que le front-end ; structure claire (modules, gardes, validation) ; SQL écrit à la main pour garder la maîtrise des droits et des requêtes. |
| Base de données | **PostgreSQL 16** (pg_trgm) | Contraintes, déclencheurs et droits par colonne : les règles métier sont garanties par la base elle-même, pas seulement par le code ; recherche tolérante aux fautes. |

## Fonctionnalités développées

- **Carte et recherche** : pharmacies publiées sur la carte ; recherche d'un médicament (nom ou DCI, tolérante aux fautes) ; « Autour de moi » trie par distance (« à X km »), sans jamais stocker la position.
- **Disponibilités** : statut toujours en mot et en signe (« disponible », « quantité limitée », « en rupture ») ; « à confirmer » après 24 h.
- **Fiche pharmacie** : adresse, horaires, téléphone, disponibilités déclarées.
- **Comptes** : inscription, vérification de l'adresse e-mail, connexion (sessions côté serveur, cookies HttpOnly, CSRF).
- **Alertes** (patient) : alerte e-mail quand un médicament redevient disponible dans un gouvernorat ; désinscription en un clic.
- **Espace pharmacien** : réclamer sa pharmacie, déclarer ses disponibilités (une par une ou « tout est à jour »), proposer la position de sa pharmacie.
- **Administration** : valider les pharmaciens et les positions, publier, corriger un nom, créer ou fusionner des fiches, suspendre un compte, journal d'audit.
- **Formulaire de contact** (voir « Limites » tant qu'il n'est pas branché).
- **Sécurité** : droits minimaux de la base, limitation de débit, refus de démarrer en production avec une configuration dangereuse (détail : `docs/SECURITE.md`).

## Structure

```
backend/     API NestJS (src/ par domaine : comptes, publique, pharmacien, administration, alertes, securite) et tests Jest
frontend/    Site Angular (src/app/core, features, shared, layout ; src/i18n fr.json et ar.json) et tests (unitaires, e2e Playwright)
database/    Migrations SQL numérotées, schema.sql, scripts PowerShell (migrations, compte de l'API, base de test, sauvegarde, jeu fictif)
docs/        Documentation des API, de la base et de la sécurité
STATUT.md    État détaillé du projet et points restant à faire
```

## Lancement de zéro (Windows, PowerShell)

**Prérequis** : Node.js 24 ou plus (avec npm), PostgreSQL 16 (avec `psql` et `pg_dump`), PowerShell 5.1, Git. Google Chrome pour les tests de bout en bout.

1. **Configuration** : à la racine, copier `.env.example` en `.env`, puis renseigner `DATABASE_URL` avec le compte propriétaire de PostgreSQL (par exemple `postgres`) et la base `mawjoud`. `.env` n'est jamais commité.
2. **Base et migrations** : `.\database\appliquer-migrations.ps1 -CreerBase` (crée la base `mawjoud` et applique toutes les migrations).
3. **Compte de l'API** : `.\database\definir-mot-de-passe-api.ps1` (mot de passe aléatoire du compte `mawjoud_api`, écrit dans `.env`, jamais affiché).
4. **Jeu de données fictif** : `.\database\jeu-fictif.ps1` (pharmacies, médicaments, stocks et comptes de démonstration inventés ; les mots de passe des comptes s'affichent une seule fois).
5. **Back-end** : `cd backend`, `npm ci`, puis `npm run start:dev`. Attendre « API prête sur http://127.0.0.1:3000/api ».
6. **Front-end** (second terminal) : `cd frontend`, `npm ci`, puis `npm start`. Ouvrir **http://localhost:4200** (le proxy de développement envoie `/api` vers le back-end).
7. **Premier administrateur** (si l'on n'utilise pas celui du jeu fictif), dans `backend` :
   `$env:ADMIN_EMAIL='admin@exemple.tn'; $env:ADMIN_MOT_DE_PASSE='<mot de passe de 10 caractères ou plus>'; npm run admin:creer; Remove-Item Env:ADMIN_MOT_DE_PASSE`

En développement, les e-mails (vérification d'adresse, alertes) ne partent pas : ils s'affichent dans le terminal du back-end, adresse masquée, avec le lien à ouvrir.

## Tests

- Back-end : `cd backend`, `npm test` (recrée une base séparée `mawjoud_test`, jamais `mawjoud`).
- Front-end : `cd frontend`, `npm test -- --watch=false` (tests unitaires) ; `npm run e2e` (tests de bout en bout avec Chrome).

## Limites connues

- E-mails réels non branchés (prestataire à choisir ; aujourd'hui affichés dans le terminal).
- Pas encore de suppression de compte, de signalement d'erreur ni de modification de l'adresse ou des horaires d'une fiche par l'administration depuis le site.
- Annuaire réel : la relecture des noms et les autorisations de publication restent à faire avant toute mise en ligne.
- Carte : pas de regroupement des points selon le zoom (500 points au plus par vue).
- Pensé et testé sous Windows (scripts PowerShell).

Détail complet et décisions : `STATUT.md`, `docs/`.
