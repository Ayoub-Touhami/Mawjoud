# Mawjoud (موجود) — projet web SUP'COM 2025/2026

Équipe : Touhami AYOUB, Garma NOUR EL HOUDA. Encadrante : Dr. Maroua Nouioua.
Slogan : « Moins de tours, plus de secours. »
Site tunisien qui montre sur une carte les pharmacies et la disponibilité des médicaments.

## Fichiers de référence (à lire avant de coder)
- `docs/Mawjoud_Specifications.pdf` : spécification fonctionnelle et technique (fonctions F1–F13, règles R1–R15, points ouverts).
- `docs/Mawjoud_Objectif2.pptx` : arborescence (14 pages), wireframes, charte graphique, écrans haute fidélité.
- Le PDF de design « Mawjoud : identité et écrans » est la référence visuelle : le suivre fidèlement.

## Pile technique
- Front-end : Angular (bilingue français/arabe, RTL pour l'arabe).
- Base de données : PostgreSQL.
- Back-end : NestJS (TypeScript), dossier `backend/`, npm, versions figées. SQL pur avec `pg` et requêtes paramétrées (pas d'ORM). Compte `mawjoud_api`, jamais `postgres`. Voir `docs/API_COMPTES.md`, `docs/API_PUBLIQUE.md`, `docs/API_PHARMACIEN.md`, `docs/API_ADMIN.md` et `docs/API_ALERTES.md` ; sécurité, droits, secrets, sauvegarde : `docs/SECURITE.md`.
- Carte : MapLibre GL JS avec les tuiles OpenFreeMap (décidé).
- Service d'e-mails, hébergement, source de l'annuaire des pharmacies : à décider ; ne pas trancher seul.

## Règles
- Navigation : toute information trouvable en 3 clics maximum.
- Un statut est toujours un mot + un signe, jamais la couleur seule.
- Couleurs : vert pharmacie #0B3D2E, menthe #CDEBDD, menthe vive #7FD1A8, bleu #1F6E9C, fond sable #F6F1E7, cartes #FFFCF6, texte #10231B. Version sombre prévue.
- Polices : Bricolage Grotesque + IBM Plex Sans (français) ; Reem Kufi + IBM Plex Sans Arabic (arabe).
- Cibles tactiles ≥ 44 px, boutons 52 px de haut, mobile d'abord (responsive).
- Ne pas utiliser les mots « MVP », « première version », « hors périmètre » dans les documents.
- Ne pas décider en silence les choix importants : poser la question avec avantages, inconvénients et recommandation.

## Façon de travailler
- Avancer par petites étapes : structure Angular et routes du plan du site, puis carte, recherche, fiche pharmacie, comptes et alertes, espace pharmacien, administration.
- Lancer et tester chaque étape avant la suivante, puis faire un commit clair.
- Branches : chaque partie se fait sur sa propre branche (par exemple `partie-8-positions-publication`), créée AVANT de coder, et les commits se font dessus. Ne jamais commiter directement sur `main`. Ne fusionner dans `main` qu'après l'accord explicite de l'équipe, une fois tous les tests passés. (Les Parties 1 à 7 ont été commitées directement sur `main`.)

## État du projet
- Parties 1 à 8 faites : front-end complet avec données simulées. Aucun serveur. Détail honnête dans `STATUT.md`, écarts avec le PDF dans `RAPPORT_ECARTS.md`, textes arabes à relire dans `TEXTES_ARABES_A_RELIRE.xlsx`.

## Lancer le projet (PowerShell, dans `frontend`)
- `npm install`, puis `npm start` : site sur http://localhost:4200/
- `npm test -- --watch=false` : tests unitaires.
- `npm run e2e` : compile les deux versions, puis lance les tests de bout en bout avec Chrome.
- `$env:CAPTURES=1; npx playwright test e2e/captures.spec.ts --project=dev` : 72 captures dans `dist/captures`.
- `npm run build` : version de production.
- `node scripts/importer-pharmacies.mjs <csv> <json>` et `node scripts/importer-medicaments.mjs <csv> <json>` : imports.
- `python scripts/exporter-textes-arabes.py <xlsx>` : fichier de relecture (demande openpyxl).

## Structure de `frontend/src/app`
- `core/models` : modèles. `core/services` : interfaces et jetons (`AUTH_SERVICE`, `ALERT_SERVICE`, `STOCK_SERVICE`, `CLAIM_SERVICE`, `PHARMACIST_AUTH_SERVICE`, `CONTACT_SERVICE`, `PHARMACIE_API`), `FraicheurService` (seule règle « à confirmer »), `HORLOGE`.
- `core/coordonnees.config.ts` : seul fichier des coordonnées publiques, à remplir (null = « à renseigner », ne rien inventer).
- `core/simulation` : implémentations simulées (mémoire et localStorage), réunies dans `fournirSimulation()`. `core/guards` : gardes. `core/donnees-test` : données de test. `core/i18n` : langues.
- `features/` : carte, recherche, pharmacie, compte, alertes, espace-pharmacien, contact, a-propos, administration (services dans `administration/services`, fournis par `fournirAdministration()`, chargés à la demande), apercu-email, design.
- `shared/` : composants. `layout/` : en-tête, pied de page, bande de données de test.
- `src/i18n/fr.json` et `ar.json` : mêmes clés. L'administration reste en français.

## Pages et outils de développement (absents de la production)
- `/design`, `/apercu-email`.
- Lien de test de vérification d'e-mail, bouton « administrateur de test » sur la connexion, valider ou refuser sur l'écran d'attente, vieillir les stocks et simuler une coupure dans l'espace pharmacien.
- Commandés par `environment.outilsSimulation`. La bande « données de test » dépend de `environment.donneesSimulees` : à passer à `false` avec les vraies données.

## Pièges connus
- Ne jamais nommer une sortie de composant comme un événement natif (`change`, `click`) : l'événement du navigateur remonte et l'écrase.
- Ne jamais mettre le nom d'un médicament en majuscules CSS : « µg » deviendrait « MG ».
