# Mawjoud (موجود)

Site tunisien qui montre sur une carte les pharmacies et la disponibilité des médicaments, déclarée par les pharmaciens. Site bilingue français / arabe.

## Choix du framework

- **Front-end : Angular.** Cadre complet et typé, adapté à plusieurs espaces (public, pharmacien, administration), avec gestion du bilingue et du sens de lecture arabe.
- **Back-end : NestJS** (TypeScript), même langage que le front-end.
- **Base de données : PostgreSQL 16.**

## Fonctionnalités développées

- Carte et recherche d'un médicament, tri par distance avec « Autour de moi ».
- Fiche d'une pharmacie : adresse, horaires, téléphone, disponibilités.
- Inscription, vérification de l'e-mail et connexion.
- Alertes e-mail quand un médicament redevient disponible.
- Espace pharmacien : déclarer ses disponibilités, proposer la position de sa pharmacie.
- Administration : valider les positions, publier, corriger ou fusionner des fiches, suspendre un compte.

## Étapes de lancement (Windows, PowerShell)

Prérequis : Node.js 24+, PostgreSQL 16 (avec `psql`), Git.

1. Copier `.env.example` en `.env`, puis renseigner `DATABASE_URL` (compte `postgres`, base `mawjoud`).
2. `.\database\appliquer-migrations.ps1 -CreerBase`
3. `.\database\definir-mot-de-passe-api.ps1`
4. `cd backend`, `npm ci`, `cd ..`, puis `.\database\jeu-fictif.ps1` : installe des pharmacies, médicaments et comptes de démonstration inventés (les données réelles ne sont pas dans le dépôt).
5. Back-end : `cd backend`, `npm run start:dev`
6. Front-end, dans un second terminal : `cd frontend`, `npm ci`, `npm start`, puis ouvrir http://localhost:4200

En développement, les e-mails de vérification et d'alerte s'affichent dans le terminal du back-end.
