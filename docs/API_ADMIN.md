# API de Mawjoud : administration, positions et publication (Partie 8)

Seules les pharmacies dont la position est **confirmée** sont publiées. Les autres attendent que leur pharmacien propose une position (`docs/API_PHARMACIEN.md`) et qu'un administrateur la valide. Cette partie décrit la validation et le cycle de publication. Préfixe `/api/v1/admin`, documenté dans Swagger (`/api/docs`, en développement). Les rattachements pharmacien-pharmacie (Partie 5) restent sous `/api/admin/rattachements` (`docs/API_COMPTES.md`).

## Accès

Rôle **administrateur** (adresse vérifiée, compte non suspendu), **session**, **jeton CSRF** (`X-XSRF-TOKEN`) sur les écritures. Sans session : `401` ; autre rôle (pharmacien, patient) : `403 acces-refuse` ; sans jeton : `403 csrf`. Limite : **300 requêtes par minute et par compte** (`429`). Chaque écriture se fait au nom de l'administrateur (`mawjoud.acteur_id`) : la base le vérifie (migration 032).

## Routes

| Méthode et route | Corps ou paramètres | Réponse |
|---|---|---|
| `GET /demandes-position` | `gouvernorat`, `page`, `taille` (50 au plus) | file des demandes en attente, plus anciennes d'abord |
| `POST /demandes-position/:id/valider` | — | `200` la fiche après validation ; `409 deja-decidee`, `statut-incompatible` |
| `POST /demandes-position/:id/refuser` | `{ motif }` (3 à 500 caractères, montré au pharmacien) | `200` ; `409 deja-decidee` |
| `GET /pharmacies` | `statut`, `gouvernorat`, `ville`, `page`, `taille` | fiches avec `motifsBlocage` |
| `POST /pharmacies/:id/relire` | — | `200` ; `409 deja-relu` ou `conditions-non-remplies` (nom absent) |
| `POST /pharmacies/:id/statut` | `{ statut, motif? }` | `200` ; `409 transition-interdite`, `conditions-non-remplies`, `meme-statut` |

### File des demandes

Chaque élément : `id` (de la demande), `pharmacie { id, nom, ville, gouvernorat, statutPublication }`, `proposee { latitude, longitude }`, `actuelle { latitude, longitude, confirmee }` ou `null`, `distanceM` (entre les deux, haversine, ou `null`), `pharmaciesProches` (autres pharmacies **publiées** à moins de 15 m de la position proposée, rayon réglable par `POSITION_RAYON_PROXIMITE_M`, voir `docs/API_PHARMACIEN.md` : à regarder avant de valider), `commentaire`, `demandeur { id, email }`, `creeeLe`.

### Valider une position

Dans une seule transaction :

1. la demande doit être **en attente** (sinon `409 deja-decidee`, avec son état) : une seule décision, une seule fois ;
2. la fiche reçoit la position : `latitude`, `longitude`, `position_confirmee = true`, `source_gps = saisie_pharmacien`, `precision_gps = exact` ; l'ancienne position reste dans `annuaire.historique_position` (motif, administrateur, demande) ;
3. une fiche `en_attente_position` avance : **nom à relire → `a_relire`** ; sinon, nom, ville et gouvernorat présents → **`pret_a_publier`** ; sinon elle reste en attente (les motifs apparaissent dans `GET /pharmacies`). **Jamais `publiee` directement.** Une fiche déjà `a_relire`, `pret_a_publier` ou `publiee` garde son statut (une fiche publiée change de position et reste publiée). Fiche `non_publiable`, `fermee` ou `fusionnee` : `409 statut-incompatible` ;
4. journal : `valider_position`, avec la pharmacie, l'ancienne et la nouvelle position, le statut avant et après.

Tant qu'une demande est **en attente ou refusée**, la position publique ne change pas.

### Refuser

Motif obligatoire, montré au pharmacien (`GET /api/v1/pharmacien/pharmacies/:id/position`). Journal : `refuser_position`, avec la position proposée et le motif.

## Cycle de publication

Statuts : `en-attente-position`, `a-relire`, `pret-a-publier`, `publiee`, `non-publiable`, `fermee`, `fusionnee` (à tirets dans l'API, snake_case en base). Seule `publiee` est visible du public (`docs/API_PUBLIQUE.md`).

### Transitions autorisées

Une seule liste, dans la base : `annuaire.transition_publication_autorisee(de, vers)` (migration 032). Le déclencheur de `annuaire.pharmacie` la lit pour **toute** écriture, scripts compris ; l'API la lit pour répondre `409` avec la liste des transitions possibles.

| De | Vers |
|---|---|
| `en_attente_position` | `a_relire`, `pret_a_publier` (normalement par la validation d'une position), `non_publiable`, `fermee` |
| `a_relire` | `pret_a_publier` (nom relu), `en_attente_position` (position à refaire), `non_publiable`, `fermee` |
| `pret_a_publier` | `publiee`, `a_relire`, `non_publiable`, `fermee` |
| `publiee` | `pret_a_publier` (dépublier), `non_publiable`, `fermee` |
| `non_publiable` | `en_attente_position`, `a_relire`, `pret_a_publier` |
| `fermee` | `pret_a_publier` (réouverture), `non_publiable` |
| `fusionnee` | aucune (la fusion de fiches n'est pas encore écrite) |

Aucune transition ne mène à `fusionnee` par cette route.

### Conditions de publication

`pret_a_publier` et `publiee` exigent **position confirmée, nom présent et relu, ville, gouvernorat** : contrainte `pharmacie_publique_complete` de la base (007, 022), impossible à contourner, même en SQL direct. L'API vérifie d'abord et répond `409 conditions-non-remplies` avec les `motifs` :

`position-manquante`, `position-non-confirmee`, `nom-manquant`, `nom-non-relu`, `ville-manquante`, `gouvernorat-manquant`.

Les mêmes motifs sont renvoyés dans `motifsBlocage` par `GET /pharmacies` (liste vide : la fiche peut être publiée).

### Relecture du nom

`POST /pharmacies/:id/relire` met `nom_a_verifier` à faux (les 47 fiches dont le nom était un nom de personne : l'administrateur décide). Le statut ne change pas : l'administrateur fait ensuite `a-relire → pret-a-publier`. La correction du nom lui-même n'est pas encore possible (droit de colonne non accordé à l'API ; à décider). Journal : `relire_nom`.

Le pharmacien ne change jamais le statut de publication : refusé par l'API (`400`, champ interdit) et par la base (032).

## Droits de la base (migrations 028, 032, 033)

- **`annuaire.pharmacie`** : `mawjoud_api` n'a plus `INSERT` ni `DELETE`, et `UPDATE` seulement sur les colonnes qu'il écrit : `telephone_principal`, `telephones_autres`, `garde` (pharmacien) ; `latitude`, `longitude`, `position_confirmee`, `source_gps`, `precision_gps`, `statut_publication`, `nom_a_verifier` (administrateur). `updated_at` suit par déclencheur.
- **Déclencheur `pharmacie_controle_modification`** : pour l'API, l'acteur est obligatoire. Un pharmacien non suspendu, rattaché et validé, ne change que téléphones et garde de **sa** pharmacie ; un administrateur non suspendu change le reste ; sinon refus. Même contrôle sur `annuaire.horaire`.
- **`prive.demande_position`** : R9 (028, le demandeur doit être rattaché et validé), suspension (027), **ajout seul** (033) : jamais supprimée, jamais modifiée, sauf l'enregistrement de sa décision, une fois (`en_attente` → `validee`, `refusee` ou `remplacee`). `UPDATE` limité aux colonnes de la décision.
- Les scripts du serveur (superutilisateur) ne sont pas soumis à l'acteur ; ils restent soumis aux transitions et aux contraintes.

## Tests

`backend/test/positions-admin.e2e-spec.ts` (30 tests, sur `mawjoud_test`) : chaque droit retiré ou resserré, tenté en SQL direct avec `mawjoud_api` (insertion, suppression, colonnes non accordées, pharmacien sans acteur, sur la pharmacie d'un autre, suspendu, patient, champs interdits, horaires) ; R9 sur les demandes (SQL et API) ; demandes en ajout seul ; demande, remplacement, proximité ; accès refusés ; position publique inchangée tant que la demande est en attente ou refusée ; validation (historique, journal, une seule fois) ; nom à relire ; circuit complet jusqu'à la liste, les proches et la carte publiques ; transitions interdites ; publication impossible sans position confirmée ou nom relu, y compris en SQL direct ; relecture ; une ligne de journal par décision ; limite de débit ; seuils lus dans la configuration.

Pour créer leurs fiches, les tests prennent le rôle `mawjoud_test_fixtures`, créé **uniquement** par `database/preparer-base-test.ps1` (jamais par une migration), avec `INSERT` dans `mawjoud_test` seulement (aucun droit dans `mawjoud`). **Sur un serveur de production, ce rôle ne doit pas exister** : `DROP ROLE mawjoud_test_fixtures;` s'il y a été créé.
