# Mawjoud : sécurité et robustesse du back-end (Partie 9d)

Ce document dit ce qui est vérifié, par quel test, et ce qui reste à décider. Les tests tournent sur `mawjoud_test` uniquement (`npm test` dans `backend/`).

## 1. Tests indépendants

Chaque fichier de tests remet `mawjoud_test` à zéro **au début** : le premier `demarrer()` d'un fichier appelle `essai.reinitialiser()` (référentiels gardés : gouvernorats, `schema_migrations`). Cette fonction n'existe que dans `mawjoud_test` : elle est créée par `database/preparer-base-test.ps1`, jamais par une migration, ne s'exécute que par le rôle `mawjoud_test_fixtures` et refuse de tourner dans une autre base.

Aucun fichier ne remet plus rien en état à la fin. Les écritures que l'API ne fait jamais (catalogue, signalement, vieillir une session ou un jeton, supprimer un compte, lire l'historique des positions) passent par le rôle `mawjoud_test_fixtures`, avec des droits dans `mawjoud_test` seulement.

Ordre des fichiers réglable (`backend/test/sequenceur.mjs`) :

```powershell
$env:ORDRE_TESTS = 'inverse';          npm run test:sans-base
$env:ORDRE_TESTS = 'aleatoire:2026';   npm run test:sans-base   # la graine s'affiche pour rejouer le même ordre
Remove-Item Env:ORDRE_TESTS;           npm run test:sans-base -- test/alertes.e2e-spec.ts   # un fichier seul
```

Vérifié le 13 novembre 2026 : ordre alphabétique, inversé, aléatoire (graines 4242, 90517, 7, 2026) et chaque fichier seul, sans recréer la base entre deux lancements.

## 2. Limitation de débit

Toutes les limites sont en mémoire du processus (un redémarrage les remet à zéro ; à revoir avec plusieurs instances). Au-delà : `429`, corps `{ "erreur": "trop-de-tentatives", "reessayerDans": <secondes> }` et en-tête `Retry-After`, rien d'autre. Les limites s'appliquent de la même façon qu'un compte existe ou non.

| Routes | Clé | Limite |
|---|---|---|
| `POST /api/comptes/connexion` (échecs) | adresse e-mail (sans casse) | 5 en 15 min |
| `POST /api/comptes/connexion` (échecs) ; liens refusés de `verification-email` et `reinitialisation` | IP | 20 en 15 min |
| `POST /api/comptes/patients`, `/pharmaciens`, `/verification-email/renvoi`, `/mot-de-passe-oublie` | IP | 10 par heure |
| `POST /api/comptes/mot-de-passe-oublie` | adresse e-mail | 3 par heure |
| `POST /api/comptes/mot-de-passe` (mauvais mot de passe actuel) | adresse du compte | 5 en 15 min |
| Routes publiques `/api/v1/pharmacies`, `/medicaments`, `/gouvernorats`, `/villes` | IP | 120 par minute |
| Espace pharmacien `/api/v1/pharmacien/*` et `/api/pharmacien/rattachement` | compte (IP sans session) | 120 par minute |
| Administration `/api/v1/admin/*` (Parties 8 et 9c) et `/api/admin/rattachements` | compte (IP sans session) | 300 par minute |
| Alertes `/api/v1/alertes/*`, désinscription comprise | compte (IP sans session) | 60 par minute |

Corrigé en Partie 9d : `/api/admin/rattachements`, `/api/pharmacien/rattachement`, `verification-email` et `reinitialisation` n'avaient aucune limite.

Test : `backend/test/limites.e2e-spec.ts` (24 tests). Chaque limite est réellement dépassée (ramenée à 3 dans une application à part). Les routes d'administration sont essayées une par une (16 routes), avec à chaque fois un second administrateur non touché.

## 3. En-têtes, CORS, cookies, Swagger

- **helmet** : `Content-Security-Policy` (`default-src 'self'`, `frame-ancestors 'self'`), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `Cross-Origin-Opener-Policy: same-origin`, **`Referrer-Policy: no-referrer`**, aussi sur les erreurs ; pas de `X-Powered-By`.
- **CORS** : liste explicite (`CORS_ORIGINES`), avec cookies. Une autre origine ne reçoit aucun `Access-Control-Allow-Origin`, et `*` n'est jamais renvoyé. En production, `*`, une liste vide ou une origine `http` empêchent le démarrage.
- **Cookies** : session `__Host-mawjoud_session` en production, `HttpOnly; Secure; SameSite=Strict; Path=/`, sans `Domain`. `XSRF-TOKEN` est `Secure; SameSite=Strict` et lisible par le front-end (protection CSRF).
- **Swagger** : monté seulement si `NODE_ENV=development`. Une valeur inconnue de `NODE_ENV` est refusée.

Test : `backend/test/production.e2e-spec.ts` (avec la configuration réellement lue pour la production).

## 4. Erreurs et journaux

- Une réponse d'erreur ne contient qu'un code (`{ "erreur": "..." }`, plus les champs refusés sans leur valeur). Elle ne contient jamais de trace, de requête SQL, de nom de table, de contrainte, de chemin de fichier ni de message de PostgreSQL. Le journal des erreurs ne garde que la méthode, le chemin, le nom de l'erreur et le code SQL.
- Corrigé en Partie 9d, ces cas donnaient une **erreur 500** et donnent maintenant `400 donnees-invalides` (`src/securite/entrees.ts`) :
  - le **caractère nul** (`\u0000`) dans le corps, la requête ou l'adresse, que PostgreSQL refuse (code 22021) ;
  - l'**imbrication** de plus de 32 niveaux, qui provoquait une récursion profonde dans la validation.
- Corrigé en Partie 9d : le fournisseur d'e-mails « console » (développement seulement, refusé en production) écrit l'adresse **masquée** (`t***@exemple.tn`). Pour un e-mail d'alerte, il n'écrit que le sujet (sans médicament) et le lien de désinscription, jamais le corps. Les liens de vérification et de réinitialisation restent lisibles en développement (décision du 13 novembre 2026).

Test : `backend/test/erreurs-journaux.e2e-spec.ts`.
- **Entrées hostiles** : injections SQL, chemins, gabarits, caractère nul, Unicode inversé, 5 000 caractères, UUID invalides, objets à la place de chaînes, `__proto__`, JSON mal formé, de 20 Ko, profond, autres types de contenu, routes et méthodes inconnues. Jamais de 500, aucune fuite.
- **Journaux** : une application de développement fait tout le parcours (inscription, connexion, mot de passe oublié, alerte réellement envoyée, administration, erreurs). Le journal capturé ne contient ni adresse en clair, ni mot de passe, ni valeur de cookie, ni nom de médicament.

## 5. Droits de la base

Tableau attendu et vérifié par `backend/test/droits.e2e-spec.ts` (un droit en plus ou en moins fait échouer le test). `mawjoud_api` se connecte et hérite de `mawjoud_application`. Il n'a que `SET` (sans héritage) sur `mawjoud_lecture_publique`, utilisé pour les routes publiques.

| Objet | `mawjoud_application` |
|---|---|
| `annuaire.gouvernorat`, `annuaire.medicament`, `annuaire.pharmacie` | SELECT |
| `annuaire.pharmacie` (colonnes) | INSERT : nom, rue, quartier, ville, code_postal, gouvernorat_code, telephone_principal, sources ; UPDATE : nom, téléphones, garde, position (5 colonnes), statut_publication, fusionnee_dans, nom_a_verifier |
| `annuaire.historique_position` | INSERT (par son déclencheur) |
| `annuaire.historique_stock`, `prive.journal_audit`, `prive.demande_position` | INSERT, SELECT (ajout seul) ; demande : UPDATE de la décision (4 colonnes) |
| `annuaire.horaire` | SELECT, INSERT, DELETE |
| `annuaire.stock` | SELECT, INSERT, DELETE ; UPDATE : statut, declare_le, declare_par |
| `prive.alerte` | SELECT, INSERT, DELETE ; UPDATE : statut, gouvernorat_code, declenchee_le, declenchee_par_pharmacie |
| `prive.utilisateur` | SELECT, INSERT ; UPDATE : email_verifie_le, mot_de_passe_hache, suspendu (**jamais** role ni email) |
| `prive.rattachement_pharmacien` | SELECT, INSERT ; UPDATE : statut, pharmacie_id, conflit, motif_code, motif_precision, decide_par, decide_le |
| `prive.session` | SELECT, INSERT, DELETE ; UPDATE : donnees, derniere_activite_le, expire_le |
| `prive.jeton` | SELECT, INSERT ; UPDATE : expire_le, utilise_le |
| `prive.envoi_email` | SELECT, INSERT ; UPDATE : statut, tentatives, prochaine_tentative_le, derniere_erreur, envoye_le |
| `prive.signalement`, `prive.message_contact` | SELECT (uuid, pharmacie_id) ; UPDATE (pharmacie_id) : fusion de fiches seulement |
| `prive.pharmacie_interne` (noms des pharmaciens) | **aucun** |
| Vues `publique.*` | SELECT (aussi pour `mawjoud_lecture_publique`) |
| Base | CONNECT ; ni CREATE ni TEMPORARY (retiré à `PUBLIC`) ; aucun schéma en CREATE |

Retirés par la migration **036** (droits plus larges que nécessaire, relevés par l'audit) :
- toute écriture du catalogue ;
- tout accès aux noms internes des pharmaciens ;
- lecture et écriture libres des signalements et des messages ;
- UPDATE de toutes les colonnes de 8 tables, dont `prive.utilisateur.role` ;
- DELETE des comptes, jetons, e-mails et rattachements ;
- UPDATE des horaires ;
- lecture de l'historique des positions ;
- tables temporaires.

Une fonction future qui aura besoin d'un de ces droits (formulaire de contact, signalement, suppression de compte) l'accordera dans sa propre migration.

Restent acceptés (à revoir si besoin) :
- `EXECUTE` par défaut de `PUBLIC` sur les fonctions. Aucune n'est `SECURITY DEFINER` sauf `annuaire.analyser_annuaire()` (accordée à l'application, `search_path` vide), et les schémas `annuaire` et `prive` ne sont pas accessibles à `PUBLIC`.
- `USAGE` de `PUBLIC` sur le schéma `public` (fonction `normaliser`).

## 6. Secrets

| Secret | Où il est | Qui le lit |
|---|---|---|
| Mot de passe de `mawjoud_api` | `.env` à la racine (`API_DATABASE_URL`), jamais commité ; sur le serveur, un `.env` lisible par le seul compte du service | le back-end |
| Mot de passe du compte propriétaire `postgres` | `.env` de développement (`DATABASE_URL`). En production, jamais dans l'environnement de l'API (démarrage refusé) : fourni dans la session, le temps des migrations et des sauvegardes | scripts de `database/` |
| Premier administrateur (`ADMIN_EMAIL`, `ADMIN_MOT_DE_PASSE`) | variables de la session PowerShell, le temps de `npm run admin:creer`, jamais dans un fichier | script de création |
| Clé d'API Brevo (`BREVO_CLE_API`, à venir) | `.env` du serveur | fournisseur d'e-mails |
| Mots de passe des comptes | empreintes argon2id dans `prive.utilisateur` | — |
| Sessions et jeton CSRF | cookies du navigateur ; la base n'a que l'empreinte SHA-256 de l'identifiant | — |
| Liens reçus par e-mail (vérification, réinitialisation, désinscription) | 256 bits aléatoires dans l'e-mail ; la base n'a que l'empreinte | — |
| Empreintes SCRAM des rôles | catalogue de PostgreSQL | serveur PostgreSQL |
| Sauvegardes | `..\sauvegardes\` (hors dépôt), non chiffrées : elles contiennent empreintes et données personnelles | — |

Il n'y a pas de secret de session ni de clé JWT. Aucune valeur secrète n'apparaît dans un message d'erreur de démarrage ou de script.

### Rotation du mot de passe de `mawjoud_api`

1. `.\database\definir-mot-de-passe-api.ps1 -Remplacer` (PowerShell, à la racine). Le script :
   - tire 256 bits aléatoires ;
   - n'envoie au serveur que l'empreinte SCRAM-SHA-256, donc aucun mot de passe en clair dans le SQL ni dans les journaux du serveur ;
   - réécrit la seule ligne `API_DATABASE_URL` de `.env` ;
   - vérifie la connexion avec le nouveau mot de passe.

   Rien n'est affiché.
2. Redémarrer l'API. Les connexions déjà ouvertes continuent jusqu'à leur fermeture, puis toute nouvelle connexion exige le nouveau mot de passe : redémarrer aussitôt.
3. Contrôler le journal de démarrage : « Connecté à la base « mawjoud » avec le compte mawjoud_api. »

Sur un serveur de production, lancer le script avec `DATABASE_URL` fournie dans la session seulement. Le compte `mawjoud_api` est commun aux bases `mawjoud` et `mawjoud_test` du même serveur.

Preuve du 13 novembre 2026, sur `mawjoud_test`, avec un **rôle jetable** `mawjoud_rotation_essai` créé puis supprimé (aucun mot de passe existant changé) :
- API compilée démarrée avec le mot de passe A : réponse 200 ;
- rotation vers B, faite comme le script (empreinte SCRAM) ;
- redémarrage avec A : refusé (« Démarrage impossible : authentification par mot de passe échouée ») ;
- redémarrage avec B : réponse 200 ;
- ni A ni B dans les journaux.

## 7. Dépendances

`npm audit` du 13 novembre 2026 :
- **front-end** : 0 vulnérabilité ;
- **back-end, dépendances de production** (`npm audit --omit=dev`) : 0 ;
- **back-end, outils de test** : 20 alertes faibles ou modérées, toutes dans la chaîne Jest et ts-jest :
  - `glob` 10.5.0 et 13.0.7 (contournement d'un délai d'abandon) : corrigé en 14.0.2 seulement, version majeure ;
  - `minimatch` 9.0.9 et 10.2.6 (motifs coûteux) : corrigé en 11.0.1 seulement, version majeure ;
  - `deepmerge` 4.3.1 (empoisonnement de prototype) : aucune version corrigée ;
  - npm propose de revenir à Jest 25 : refusé.

  Risque réel : quasi nul. Ces outils ne tournent que sur le poste de développement, sur nos propres fichiers, et aucun n'est livré en production. Versions laissées figées ; à revoir à la prochaine version de Jest.

## 8. Sauvegarde et restauration

```powershell
.\database\sauvegarder.ps1                 # mawjoud -> ..\sauvegardes\mawjoud-AAAAMMJJ-HHMMSS.dump + .manifeste.json
.\database\sauvegarder.ps1 -Base mawjoud_test
```

Le mot de passe est lu dans `.env` et passé par `PGPASSWORD` le temps de la commande : jamais en argument, jamais affiché, jamais tapé, donc jamais dans l'historique. Le dossier doit être hors du dépôt. Le manifeste donne les lignes par table, la dernière migration et l'empreinte SHA-256 du fichier.

Restaurer (compte propriétaire, rôles `mawjoud_api`, `mawjoud_application` et `mawjoud_lecture_publique` déjà présents sur le serveur ; sur un nouveau serveur, les créer d'abord avec la migration 025 et `definir-mot-de-passe-api.ps1`) :

```powershell
# dans une session où PGHOST, PGPORT, PGUSER, PGPASSWORD sont définis (jamais sur la ligne de commande)
psql -d postgres -c "CREATE DATABASE mawjoud_restauree WITH ENCODING 'UTF8' TEMPLATE template0;"
pg_restore --exit-on-error --single-transaction --dbname=mawjoud_restauree ..\sauvegardes\mawjoud-AAAAMMJJ-HHMMSS.dump
```

Puis comparer les lignes par table au manifeste, et vérifier l'empreinte du fichier avant de restaurer.

Preuve du 13 novembre 2026 : sauvegarde de `mawjoud` (441 Ko, empreinte conforme), puis restauration dans une base vide temporaire en une transaction. Tout est identique à `mawjoud` :
- 10 825 lignes, et empreinte md5 du contenu de chacune des 19 tables ;
- 135 contraintes, 35 déclencheurs, 84 index, 144 droits, 28 fonctions ;
- schéma complet, octet pour octet.

La base temporaire et le fichier de la preuve ont ensuite été supprimés.

## 9. Refus de démarrer en production

Avec `NODE_ENV=production`, le serveur s'arrête (« Démarrage impossible : … », sans aucune valeur secrète) si :
- `DATABASE_URL` (compte `postgres`) est dans l'environnement de l'API ;
- `CORS_ORIGINES` est vide, contient `*` ou une origine non `https` ;
- le mot de passe de `mawjoud_api` fait moins de 24 caractères ou ressemble à une valeur d'exemple ;
- le compte est `postgres`, ou un superutilisateur (vérifié à la connexion) ;
- les e-mails ne passent pas par Brevo (console interdite) ;
- `FRONT_URL` n'est pas en `https` ;
- le rôle `mawjoud_test_fixtures` existe sur le serveur PostgreSQL ;
- `NODE_ENV` a une valeur inconnue (toujours vérifié). Swagger n'est monté qu'en développement.

Test : `backend/test/production.e2e-spec.ts` (un test par refus, plus un témoin accepté).

**Reste à décider** : un serveur lancé **sans** `NODE_ENV` démarre en développement (console d'e-mails, Swagger). Il faut le prévoir dans le service système de l'hébergement (`NODE_ENV=production` obligatoire). L'hébergement n'est pas encore choisi.
