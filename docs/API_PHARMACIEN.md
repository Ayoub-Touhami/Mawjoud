# API de Mawjoud : espace pharmacien (Partie 7)

Un pharmacien connecté gère sa pharmacie : disponibilités des médicaments, téléphone, garde et horaires, historique de ses déclarations. Préfixe `/api/v1/pharmacien`, documenté dans Swagger (`/api/docs`, en développement). Comptes et sessions : `docs/API_COMPTES.md` ; recherche publique : `docs/API_PUBLIQUE.md`.

## Accès

- **Session** (cookie) obligatoire, **rôle pharmacien**, **adresse e-mail vérifiée**, **compte non suspendu** (`403 compte-suspendu`). Sans session : `401 non-connecte` ; autre rôle : `403 acces-refuse`.
- **Jeton CSRF** (`X-XSRF-TOKEN`) obligatoire sur toutes les écritures (`PUT`, `POST`, `PATCH`, `DELETE`) : sinon `403 csrf`.
- **Ma pharmacie** = celle d'un rattachement **validé** par l'administrateur (demande et validation : Partie 5, `docs/API_COMPTES.md`). Un compte dont la demande n'est pas encore validée n'a aucune pharmacie et ne peut rien déclarer. La base limite aujourd'hui à une pharmacie par compte ; l'API renvoie une liste.

### R9 : la pharmacie d'un autre

Toute route qui vise une pharmacie qui n'est pas la mienne répond **`404 introuvable`**, exactement comme pour une pharmacie inexistante. Choix : un `403` révélerait que l'identifiant existe et appartient à quelqu'un d'autre ; le `404` ne dit rien. La tentative est **journalisée** (`prive.journal_audit`, action `acces_refuse`, cible la pharmacie visée, acteur le compte, détail : l'opération). Un identifiant mal formé reste un `400`.

La base vérifie aussi, même si le back-end se trompait :

- **déclaration** : le déclarant doit être le pharmacien vérifié, non suspendu, de cette pharmacie (déclencheur `stock_declarant`, migration 014) ;
- **retrait** : l'acteur de la transaction (`mawjoud.acteur_id`) doit être ce pharmacien ou un administrateur (déclencheur `stock_retrait`, migration 031) ;
- **compte suspendu** : refusé pour le stock (014), les positions et les rattachements (027).

## Routes

| Méthode et route | Corps ou paramètres | Réponse |
|---|---|---|
| `GET /pharmacies` | — | `{ elements: [{ id, nom, statutPublication, medicamentsDeclares }] }` |
| `GET /pharmacies/:id/disponibilites` | `q` (nom ou DCI, 2 caractères au moins), `page`, `taille` (50 au plus) | `{ elements: [{ medicament, statut, declareLe }], page, taille, total }` |
| `PUT /pharmacies/:id/disponibilites/:medicamentId` | `{ statut }` : `disponible`, `quantite-limitee`, `en-rupture` | `200` la disponibilité déclarée |
| `POST /pharmacies/:id/disponibilites/lot` | `{ declarations: [{ medicamentId, statut }] }`, 1 à 100 lignes | `200 { declarees, elements }` |
| `DELETE /pharmacies/:id/disponibilites/:medicamentId` | — | `204` |
| `GET /pharmacies/:id/historique` | `page`, `taille` | `{ elements, page, taille, total }`, du plus récent au plus ancien |
| `PATCH /pharmacies/:id` | un ou plusieurs de : `telephone`, `telephonesAutres`, `garde`, `horaires` | `200` la fiche |
| `POST /pharmacies/:id/position` | `{ latitude, longitude, precisionMetres?, commentaire?, confirmerProximite? }` | `201 { demande, avertissement? }` ; `409 position-proche` |
| `GET /pharmacies/:id/position` | — | `{ demande, positionActuelle }` |
| `GET /medicaments` | `q`, `limite` | la recherche publique, à l'identique |

`medicament` = `{ id, nomCommercial, dci, forme, dosage }`.

## Déclarations

- **Statuts** : les trois de la base (R4) ; « à confirmer » n'est pas un statut déclaré (calculé par le front-end après 24 h, R6). Pas de quantité : le modèle n'en prévoit pas.
- **Date** : `declareLe` est toujours `now()` du serveur PostgreSQL. Le client ne peut pas l'imposer : un champ `declareLe` envoyé est **refusé** (`400 donnees-invalides`, `champs: ["declareLe"]`) et rien n'est écrit, plutôt qu'ignoré en silence.
- **Historique** : chaque déclaration (unitaire ou en lot) ajoute une ligne à `annuaire.historique_stock` (déclencheur `stock_tracer`, 014). L'historique est en ajout seul : `UPDATE`, `DELETE` et `TRUNCATE` sont refusés (droits retirés en 021, déclencheurs en 014). `GET …/historique` ne montre que **mes** déclarations sur cette pharmacie (jamais celles d'un pharmacien précédent).
- **Lot** : 100 lignes au plus, **tout ou rien** dans une seule transaction. Erreurs :
  - format : `400 donnees-invalides` avec le chemin de chaque champ fautif (`declarations.3.statut`) ; plus de 100 lignes : `champs: ["declarations"]` ;
  - contenu : `400 lot-invalide`, `lignes: [{ index, medicamentId, erreur }]` avec `medicament-inconnu` ou `doublon`.
- **Retrait** (`DELETE`) : la ligne de `annuaire.stock` est supprimée (le médicament n'est plus listé, ni en public) ; l'historique est conservé ; le retrait est journalisé (`retirer_declaration`, avec l'ancien statut).
- Une pharmacie **non publiée** (`en_attente_position`, `a_relire`, `pret_a_publier`) reçoit des déclarations, mais elles restent invisibles du public tant qu'elle n'est pas `publiee` (vues `publique.*`). Cet espace ne change jamais le statut de publication.

## Position (Partie 8)

- **Proposer** : latitude 30 à 38, longitude 7 à 12 (bornes de la Tunisie), arrondies à 6 décimales par défaut (environ 10 cm) ; `precisionMetres` (précision annoncée par le GPS) 50 m au plus par défaut ; valeurs numériques JSON seulement (une chaîne est refusée).
- **Une seule demande en attente** par pharmacie : une nouvelle proposition remplace la précédente, qui reste conservée (statut `remplacee`). Les demandes sont en ajout seul (033).
- **Proximité** : si une autre pharmacie **publiée** se trouve à moins de **15 m** (par défaut), réponse `409 position-proche` avec la liste (`{ id, nom, distanceM }`). Pour maintenir la position, renvoyer avec `confirmerProximite: true` : la demande est enregistrée, l'avertissement est rendu et l'administrateur voit ces pharmacies proches dans sa file.
- **La fiche ne change pas** tant qu'un administrateur n'a pas validé (`docs/API_ADMIN.md`).
- **État** : ma dernière demande pour cette pharmacie (`en-attente`, `validee`, `refusee` avec `motifRefus`, `remplacee`) et la position actuelle de la fiche.
- R9 : pharmacie d'un autre → `404`, journalisé ; la base refuse aussi (028). Journal : `proposer_position`.

### Seuils (valeurs de configuration)

Réglables par variables d'environnement (`.env`), sans changer le code ; valeurs par défaut :

| Variable | Défaut | Bornes | Rôle |
|---|---|---|---|
| `POSITION_RAYON_PROXIMITE_M` | 15 | 1 à 200 | Autre pharmacie publiée à moins de ce rayon : `409 position-proche` sans confirmation, et signalée dans la file de l'administrateur |
| `POSITION_PRECISION_MAX_M` | 50 | 1 à 1 000 | Précision annoncée par le GPS au-delà de laquelle la position est refusée (`400`, `champs: ["precisionMetres"]`, avec `precisionMaxM`) |
| `POSITION_DECIMALES` | 6 | 4 à 8 | Décimales gardées pour la latitude et la longitude (6 : environ 10 cm) |

Une valeur hors bornes empêche le serveur de démarrer (message clair). Lues dans `backend/src/config/configuration.ts` (`positions`).

## Fiche (`PATCH`)

- **Modifiables** : `telephone` (`+216` et 8 chiffres, ou `null` pour « Téléphone non renseigné »), `telephonesAutres` (5 au plus, sans doublon), `garde` (`jour`, `nuit` ou `null`), `horaires` (remplace toutes les plages : 21 au plus, `jour` 0 à 6 avec 0 = dimanche, heures `HH:MM`, ouverture différente de la fermeture, pas deux plages commençant à la même heure le même jour ; une fermeture avant l'ouverture veut dire « le lendemain »).
- **Liste blanche stricte** : tout autre champ (nom, rue, adresse, ville, gouvernorat, latitude, longitude, statut de publication…) est **refusé** (`400`, `champs` le nomme), jamais ignoré. La position passera par la demande de position (Partie 8).
- **Journal** : une entrée `modifier_fiche` par champ réellement changé, avec `{ champ, ancien, nouveau }` (données publiques de la pharmacie).

## Limitation

120 requêtes par minute **et par compte** (un lot compte pour une), en mémoire comme les autres limites ; `429 trop-de-tentatives` avec `Retry-After`. Un autre compte sur la même adresse IP n'est pas touché.

## Droits de la base

Depuis la Partie 8 (032) : `mawjoud_api` n'a plus `INSERT` ni `DELETE` sur `annuaire.pharmacie`, et `UPDATE` seulement sur certaines colonnes ; **la base contrôle aussi les champs du pharmacien** (téléphones et garde de sa seule pharmacie, ses horaires ; acteur obligatoire, compte non suspendu). `mawjoud_api` a `SELECT`, `INSERT`, `UPDATE`, `DELETE` sur `annuaire.stock` et `annuaire.horaire`, `SELECT`, `INSERT` (sans `UPDATE` ni `DELETE`) sur `annuaire.historique_stock` et `prive.journal_audit`. La migration 031 ajoute seulement le déclencheur de retrait et trois actions du journal (`modifier_fiche`, `retirer_declaration`, `acces_refuse`).

## Tests

`backend/test/espace-pharmacien.e2e-spec.ts` (29 tests, sur `mawjoud_test`) : accès (sans session, sans CSRF, autre rôle, compte non validé, compte suspendu), R9 sur toutes les routes avec réponse identique à une pharmacie inexistante et journalisation, refus de la base (déclaration au nom d'un autre, retrait sans acteur ou par un autre), date fixée par le serveur et date du client refusée, historique en ajout seul, lot de 100 accepté, 101 refusé, tout ou rien avec rapport par ligne, retrait journalisé et historique conservé, PATCH (champs autorisés journalisés, 11 champs interdits, valeurs invalides), déclarations invisibles tant que la pharmacie n'est pas publiée puis visibles une fois publiée, recherche de médicaments identique à la publique, limite par compte.

## Pas encore fait

- Le front-end attend aussi « suivre un médicament sans le déclarer » (`suivreMedicament`) et « tout confirmer » (`confirmerTout`) : à décider avec la Partie 9 (le lot peut déjà redéclarer tous les statuts d'un coup).
- Rappels aux pharmacies qui ne mettent pas à jour, alertes : Partie 9.
