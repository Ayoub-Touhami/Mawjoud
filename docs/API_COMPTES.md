# API de Mawjoud : comptes et authentification

Back-end NestJS 12 (TypeScript, module ES), dossier `backend/`. Routes publiques de recherche et de carte : `docs/API_PUBLIQUE.md` ; espace pharmacien : `docs/API_PHARMACIEN.md` ; administration des positions et de la publication : `docs/API_ADMIN.md`. Accès à PostgreSQL avec `pg` et des requêtes paramétrées uniquement, sans ORM. Partie 5 : comptes et authentification seulement (recherche, stock et alertes : Parties 6 à 9). En développement, la documentation interactive est sur `http://127.0.0.1:3000/api/docs` (Swagger, absente en production).

## Lancer

PowerShell, dans `backend` :

| Commande | Rôle |
|---|---|
| `npm install` | Dépendances (versions figées, `package-lock.json`) |
| `npm run start:dev` | Compile et lance l'API sur `http://127.0.0.1:3000/api`, relance à chaque compilation |
| `npm start` | Compile et lance |
| `npm test` | Recrée la base `mawjoud_test`, puis lance les tests Jest (jamais sur `mawjoud`) |
| `npm run admin:creer` | Crée le premier administrateur (voir plus bas) |

Préalables, à la racine du dépôt : migrations appliquées (`.\database\appliquer-migrations.ps1`), puis mot de passe du compte `mawjoud_api` (`.\database\definir-mot-de-passe-api.ps1`, qui écrit `API_DATABASE_URL` dans `.env` sans l'afficher).

## Connexion à la base

- Le back-end utilise **`mawjoud_api`** (migration 025), membre de `mawjoud_application` : lecture et écriture des données, aucun droit sur la structure ni sur `schema_migrations`, ni superutilisateur. Délai maximal d'une requête : 15 s.
- Il **refuse de démarrer** avec le compte `postgres`, avec un superutilisateur, ou sur les bases `cleanapp`, `postgres`, `template0`, `template1`. En test, il ne se connecte qu'à `mawjoud_test`.
- Le mot de passe de `mawjoud_api` : 256 bits aléatoires ; le serveur PostgreSQL n'en a reçu que l'empreinte SCRAM. Pour le changer : `.\database\definir-mot-de-passe-api.ps1 -Remplacer`.

## Routes

Préfixe `/api`. Corps en JSON (10 Ko au plus). Toute route déclare qui peut l'appeler ; une route sans déclaration est refusée.

| Méthode et route | Accès | Corps | Réponse |
|---|---|---|---|
| `POST /comptes/patients` | public | `email`, `motDePasse`, `langue?` (`fr`, `ar`) | 202 `{ statut: "envoye" }`, toujours |
| `POST /comptes/pharmaciens` | public | idem | 202, toujours |
| `POST /comptes/verification-email` | public | `jeton` | 204 ; 400 `lien-invalide` ; 410 `lien-expire` |
| `POST /comptes/verification-email/renvoi` | public | `jetonExpire?`, `langue?` | 202, toujours |
| `POST /comptes/connexion` | public | `email`, `motDePasse` | 200 `Utilisateur` + cookies ; 401 `identifiants` ; 429 |
| `POST /comptes/deconnexion` | connecté | — | 204, cookies effacés |
| `GET /comptes/moi` | connecté | — | 200 `Utilisateur` |
| `POST /comptes/mot-de-passe` | connecté | `motDePasseActuel`, `nouveauMotDePasse` | 204, toutes les sessions fermées |
| `POST /comptes/mot-de-passe-oublie` | public | `email`, `langue?` | 202, toujours |
| `POST /comptes/reinitialisation` | public | `jeton`, `nouveauMotDePasse` | 204, toutes les sessions fermées |
| `GET /pharmacien/rattachement` | pharmacien | — | dernière demande ou `null` |
| `GET /pharmacien/rattachement/recherche` | pharmacien, e-mail vérifié | `q` (2 à 100 caractères) | `{ elements }` : 20 fiches réclamables au plus, par nom, ville ou rue ; jamais un nom « à relire » (Partie 9e) |
| `POST /pharmacien/rattachement` | pharmacien, e-mail vérifié | `pharmacieId` **ou** `ajout`, `justificatif?` | 201 `DemandeReclamation` ; 409 `demande-en-cours`, `deja-rattache` ; 404 |
| `GET /admin/rattachements?etat=en-attente` | administrateur | — | liste des demandes |
| `POST /admin/rattachements/:id/valider` | administrateur | — | 200 ; 409 `deja-decidee`, `pharmacie-attribuee`, `pharmacie-a-creer` |
| `POST /admin/rattachements/:id/refuser` | administrateur | `motifCode`, `motifPrecision?` | 200 |

`Utilisateur` a la forme du modèle du front-end : `id` (uuid), `email`, `role`, `emailVerifie`, et pour un pharmacien `compteVerifie`, `pharmacieId`, `suspendu`. Jamais de mot de passe ni d'empreinte. Les valeurs à tirets du front-end (`en-attente`, `pharmacie-attribuee`) sont converties depuis le snake_case de la base.

## Erreurs

Corps `{ "erreur": "<code>" }`, parfois avec un complément (`motif`, `champs`, `reessayerDans`). Le front-end traduit le code ; aucune valeur reçue n'est recopiée (un mot de passe ne revient jamais).

| Code | Statut | Sens |
|---|---|---|
| `donnees-invalides` | 400, 413 | Champ manquant, invalide ou inconnu (`champs` : leurs noms) ; corps trop gros |
| `json-invalide`, `type-contenu` | 400, 415 | JSON illisible ; corps qui n'est pas du JSON |
| `mot-de-passe-faible` | 400 | `motif` : `trop-court`, `trop-long`, `trop-courant`, `identique-email` |
| `mot-de-passe-actuel` | 400 | Ancien mot de passe incorrect (changement) |
| `identifiants` | 401 | Adresse ou mot de passe incorrect : même réponse si l'adresse n'existe pas |
| `non-connecte` | 401 | Pas de session valable |
| `acces-refuse`, `email-non-verifie`, `compte-suspendu` | 403 | Rôle insuffisant ou route sans déclaration ; adresse à vérifier ; compte suspendu |
| `csrf`, `origine-refusee` | 403 | Jeton CSRF absent ou faux ; origine non autorisée |
| `lien-invalide`, `lien-expire` | 400, 410 | Lien inconnu ou déjà utilisé ; lien expiré |
| `trop-de-tentatives` | 429 | Limite atteinte ; en-tête `Retry-After` |

## Sessions et cookies

- Session en base (`prive.session`) : identifiant aléatoire de 256 bits dans le cookie, **empreinte SHA-256** en base. Pas de JWT.
- Durée : **7 jours glissants** (l'échéance avance à chaque requête, au plus toutes les 5 minutes), **30 jours au plus** après la connexion.
- Cookie de session : `HttpOnly`, `SameSite=Strict`, `Path=/` ; en production `Secure` et nom `__Host-mawjoud_session`.
- **`SameSite=Strict` suppose que le site et l'API sont sur le même domaine principal** (même « site » pour le navigateur : par exemple `mawjoud.tn` et `api.mawjoud.tn`, ou le même hôte avec `/api`). En développement, `localhost:4200` et `localhost:3000` sont le même site (le port ne compte pas). Si l'API passait un jour sur un autre domaine principal, le navigateur n'enverrait plus le cookie : il faudrait revoir ce choix (et la protection CSRF), pas passer en `SameSite=None`.
- Arriver sur le site depuis un lien d'e-mail ne pose pas de problème : la page s'ouvre normalement, puis ses appels à l'API viennent du même site et portent le cookie.
- Une connexion ouvre toujours une nouvelle session (l'ancienne du même navigateur est fermée). Changement ou réinitialisation du mot de passe : **toutes** les sessions du compte sont fermées.

## Protection CSRF

- À la connexion, le serveur pose aussi un cookie `XSRF-TOKEN` (lisible par JavaScript), lié à la session (empreinte dans `prive.session.donnees`).
- Toute requête `POST` d'un navigateur connecté doit renvoyer ce jeton dans l'en-tête `X-XSRF-TOKEN` : c'est le comportement par défaut d'Angular `HttpClient`, **à condition que l'API soit appelée sur la même origine** (proxy de `ng serve` vers `/api`, à prévoir en Partie 9).
- Pour toute requête qui modifie : l'en-tête `Origin`, s'il est présent, doit être dans la liste autorisée (`http://localhost:4200` en développement) ; le corps doit être du JSON (un formulaire HTML d'un autre site est refusé).
- `GET /comptes/moi` renvoie un nouveau cookie `XSRF-TOKEN` s'il a disparu.

## Mots de passe

- Empreinte **argon2id** (19 Mio, 2 passes, 1 fil, recommandations OWASP), recalculée à la connexion si les paramètres changent.
- Politique (décision du 13 novembre 2026) : **10 à 128 caractères** (comptés en lettres : l'arabe est accepté), refus de l'adresse e-mail, aucune règle de composition. Normalisation Unicode NFC.
- Mots de passe courants refusés, dans `backend/donnees` :
  - `mots-de-passe-courants.txt` : les 10 000 plus courants en anglais (SecLists, licence MIT), refusés à l'identique ;
  - `mots-de-passe-courants-fr-ar.txt` : une courte liste Mawjoud en français, en arabe translittéré et propre à la Tunisie (`motdepasse`, `azertyuiop`, `bismillah`, `tunisie`, prénoms et clubs fréquents…). Chaque racine est refusée seule **ou suivie seulement de chiffres, d'espaces ou de ponctuation** (`motdepasse2026!`, `bismillah123`), mais pas si d'autres mots la suivent (`motdepasse-de-cedre` est accepté). À enrichir au besoin, une racine par ligne.
- Adresse inconnue à la connexion : le serveur fait le même calcul argon2id sur une empreinte factice, pour que la durée de réponse ne révèle rien.

## Limitation des tentatives

Identiques qu'une adresse existe ou non :

| Action | Limite |
|---|---|
| Connexion, par adresse e-mail | 5 échecs en 15 minutes (effacés après une connexion réussie) |
| Connexion, par IP | 20 échecs en 15 minutes |
| Inscription, renvoi de lien, mot de passe oublié, par IP | 10 par heure |
| Renvoi de lien, mot de passe oublié, « déjà un compte », par adresse | 3 par heure |

Derrière un proxy en production, mettre `TRUST_PROXY=true` pour que l'IP réelle soit lue.

**Les compteurs sont gardés en mémoire du serveur** (`backend/src/securite/limiteur.ts`). Ils repartent de zéro à chaque redémarrage, et chaque instance a les siens. C'est suffisant en développement et avec un seul serveur. **En production avec plusieurs instances, les compteurs doivent être déplacés en base** (une table PostgreSQL, ou un stockage partagé) : sinon un attaquant multiplie ses essais par le nombre d'instances. `LimiteursService` est le seul endroit à changer.

## Inscription et adresse déjà utilisée

La réponse est **identique** que l'adresse soit libre ou non (décision du 13 novembre 2026). Adresse libre : le compte est créé et le lien de vérification envoyé (24 h, usage unique). Adresse prise : son propriétaire reçoit « vous avez déjà un compte », avec un lien vers le mot de passe oublié. Écart assumé avec F9 et l'erreur `email-utilise` du front-end, à adapter en Partie 9. L'inscription n'ouvre pas de session : la personne se connecte ensuite (possible avant la vérification ; les routes qui l'exigent répondent `email-non-verifie`).

Un pharmacien s'inscrit de la même façon. Son compte n'est « vérifié » (`compteVerifie`) qu'après validation de son rattachement par l'administrateur ; il doit avoir vérifié son adresse pour réclamer une pharmacie. **Compte suspendu** : il peut se connecter, voir son état (`/comptes/moi`, sa demande de rattachement), se déconnecter et changer son mot de passe ; rien d'autre. Les gardes de rôle refusent un compte suspendu par défaut (`403 compte-suspendu`), sauf sur les routes qui le permettent expressément (`suspenduAutorise`, lecture seule). La base refuse aussi, même si le back-end se trompait : déclaration de stock (migration 014), proposition ou changement de position en son nom, demande de rattachement (migration 027). Un administrateur suspendu perd toute l'administration.

## E-mails

- Développement : écrits dans la console du serveur (lien compris). Tests : gardés en mémoire. Production : Brevo, interface prête (`EmailBrevo`) mais envoi non réalisé ; la configuration refuse la console en production.
- Textes en français et en arabe (`langue`) ; textes arabes à relire.
- Chaque envoi est tracé dans `prive.envoi_email` (type, destinataire, statut, tentatives, nom de l'erreur). Ni le contenu ni le lien ne sont stockés. Les nouvelles tentatives automatiques seront écrites avec les alertes ; pour un e-mail de compte, l'utilisateur redemande le lien.
- Liens : `FRONT_URL/compte/verification-email?jeton=…` et `FRONT_URL/compte/mot-de-passe-oublie?jeton=…` (page à compléter en Partie 9).

### Jeton dans l'adresse : obligations du front-end

Tant qu'il n'a pas servi, le jeton d'un lien d'e-mail donne accès au compte (réinitialisation). Pour qu'il ne fuie pas par l'historique, les favoris, une capture d'écran ou l'en-tête `Referer`, le front-end **doit** :

1. **retirer `?jeton=` de l'adresse dès sa lecture**, avant tout autre appel ou affichage : garder le jeton en mémoire, puis remplacer l'adresse sans le paramètre (`Router.navigate` avec `replaceUrl: true`, ou `history.replaceState`) ;
2. **envoyer `Referrer-Policy: no-referrer`** pour ces pages (en-tête du serveur qui sert le front-end, ou `<meta name="referrer" content="no-referrer">` dans `index.html`), pour qu'aucun lien externe, image ou police ne reçoive l'adresse complète ;
3. ne jamais journaliser l'adresse complète, ni l'envoyer à un outil de mesure d'audience.

L'API applique déjà `Referrer-Policy: no-referrer` à ses propres réponses (helmet). Ces trois points sont à réaliser en Partie 9.

## Journal d'audit

`prive.journal_audit` reçoit : `connexion_reussie`, `connexion_echouee` (motif `mot_de_passe`, `compte_inconnu` ou `limite_atteinte`), `changer_mot_de_passe`, `reinitialiser_mot_de_passe`, `valider` et `refuser` (rattachements), `creer_administrateur`. Jamais de mot de passe, de jeton, d'adresse IP ni d'adresse e-mail : la cible est l'`uuid` du compte, ou `inconnu`.

## Premier administrateur

Le script lit l'adresse et le mot de passe dans les variables d'environnement de la session ; rien n'est écrit dans un fichier. Il refuse s'il existe déjà un administrateur, et ne promeut jamais un compte existant. PowerShell, dans `backend` :

```powershell
$env:ADMIN_EMAIL = 'admin@exemple.tn'
$s = Read-Host -AsSecureString 'Mot de passe administrateur'   # rien ne s'affiche à la saisie
$env:ADMIN_MOT_DE_PASSE = [Net.NetworkCredential]::new('', $s).Password
npm run admin:creer
Remove-Item Env:ADMIN_MOT_DE_PASSE, Env:ADMIN_EMAIL; Remove-Variable s
```

## Tests

`npm test` recrée `mawjoud_test` (`database/preparer-base-test.ps1`, qui ne touche qu'à cette base), applique toutes les migrations, puis lance les tests Jest de bout en bout (supertest) : inscription, vérification d'e-mail, connexion, mauvais mot de passe, limitation des tentatives, accès refusé par rôle et refus par défaut, CSRF, sessions glissantes, déconnexion, réinitialisation et changement du mot de passe, rattachement et validation d'un pharmacien, pharmacien suspendu (ni stock, ni position, ni rattachement), premier administrateur, refus du compte `postgres`.

## Reste à faire (autres parties)

- Partie 9 : brancher le front-end (proxy `/api`, réponse neutre à l'inscription, page de réinitialisation, règles du mot de passe affichées).
- Suppression de compte (F12), désabonnement, nouvelles tentatives d'envoi, purge des sessions expirées depuis 30 jours.
- Brevo en production ; compteurs de limitation en base si plusieurs instances.
- Route de suspension par l'administrateur (Partie 8) : en attendant, les tests suspendent un compte directement en base.
