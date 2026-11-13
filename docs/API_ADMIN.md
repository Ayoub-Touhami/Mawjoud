# API de Mawjoud : administration (Parties 8 et 9c)

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
| `POST /pharmacies/:id/relire` | — | `200` ; `409 deja-relu`, `conditions-non-remplies` (nom absent) ou `fiche-fusionnee` |
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
| `fusionnee` | aucune (définitif ; rattrapage manuel seulement, voir « Fusion de deux fiches ») |

Aucune transition ne mène à `fusionnee` par cette route : seule la fusion (`POST /pharmacies/:id/fusionner`) y mène.

### Conditions de publication

`pret_a_publier` et `publiee` exigent **position confirmée, nom présent et relu, ville, gouvernorat** : contrainte `pharmacie_publique_complete` de la base (007, 022), impossible à contourner, même en SQL direct. L'API vérifie d'abord et répond `409 conditions-non-remplies` avec les `motifs` :

`position-manquante`, `position-non-confirmee`, `nom-manquant`, `nom-non-relu`, `ville-manquante`, `gouvernorat-manquant`.

Les mêmes motifs sont renvoyés dans `motifsBlocage` par `GET /pharmacies` (liste vide : la fiche peut être publiée).

### Relecture du nom

`POST /pharmacies/:id/relire` met `nom_a_verifier` à faux (les 47 fiches dont le nom était un nom de personne : l'administrateur décide). Le statut ne change pas : l'administrateur fait ensuite `a-relire → pret-a-publier`. Journal : `relire_nom`. La correction du nom lui-même : `POST /pharmacies/:id/nom` (Partie 9c, ci-dessous).

Le pharmacien ne change jamais le statut de publication : refusé par l'API (`400`, champ interdit) et par la base (032).

## Droits de la base (migrations 028, 032, 033, 035)

- **`annuaire.pharmacie`** : `mawjoud_api` n'a pas `DELETE` ; `INSERT` seulement sur `nom`, `rue`, `quartier`, `ville`, `code_postal`, `gouvernorat_code`, `telephone_principal`, `sources` (création par un administrateur, 035) ; `UPDATE` seulement sur les colonnes qu'il écrit : `telephone_principal`, `telephones_autres`, `garde` (pharmacien) ; `latitude`, `longitude`, `position_confirmee`, `source_gps`, `precision_gps`, `statut_publication`, `nom_a_verifier`, `nom`, `fusionnee_dans` (administrateur). `updated_at` suit par déclencheur.
- **Déclencheur `pharmacie_controle_modification`** : pour l'API, l'acteur est obligatoire. Un pharmacien non suspendu, rattaché et validé, ne change que téléphones et garde de **sa** pharmacie ; un administrateur non suspendu change le reste ; sinon refus. Même contrôle sur `annuaire.horaire`. Une fiche `fusionnee` ne se modifie plus du tout par l'API (fiche, horaires, disponibilités ; 035).
- **`prive.demande_position`** : R9 (028, le demandeur doit être rattaché et validé), suspension (027), **ajout seul** (033) : jamais supprimée, jamais modifiée, sauf l'enregistrement de sa décision, une fois (`en_attente` → `validee`, `refusee` ou `remplacee`). `UPDATE` limité aux colonnes de la décision.
- Les scripts du serveur (superutilisateur) ne sont pas soumis à l'acteur ; ils restent soumis aux transitions et aux contraintes.

## Administration générale (Partie 9c, migration 035)

Même accès que ci-dessus (administrateur, session, CSRF, 300 requêtes par minute). Toute écriture est journalisée.

| Méthode et route | Corps ou paramètres | Réponse |
|---|---|---|
| `POST /pharmacies/:id/nom` | `{ nom, nomRelu? }` | `200` la fiche ; `409 confirmation-requise`, `meme-valeur`, `fiche-fusionnee` |
| `POST /pharmacies` | `{ rattachementId, nom, ville, gouvernorat, rue?, quartier?, codePostal?, telephone?, confirmerSansDoublon? }` | `201 { pharmacie, rattachementId }` ; `409 doublons-probables`, `deja-decidee`, `pas-une-demande-d-ajout` ; `400` gouvernorat inconnu |
| `POST /pharmacies/:id/fusionner` | `{ fusionneeId, motif }` (`:id` = fiche conservée) | `200 { conservee, fusionnee, bilan }` ; `409 meme-fiche`, `deja-fusionnee` |
| `GET /comptes` | `role`, `statut` (`actif`, `suspendu`), `email` (partie de l'adresse), `page`, `taille` | comptes, sans secret |
| `POST /comptes/:id/suspendre` | `{ motif }` (3 à 500 caractères) | `200 { id, suspendu, sessionsFermees }` ; `409 soi-meme`, `dernier-administrateur`, `deja-suspendu` |
| `POST /comptes/:id/retablir` | `{ motif }` | `200 { id, suspendu: false }` ; `409 pas-suspendu` |
| `GET /journal` | `action`, `cibleType`, `cibleId`, `acteur` (uuid), `depuis`, `jusqua` (jours inclus, `AAAA-MM-JJ`), `page`, `taille` | entrées, de la plus récente à la plus ancienne |

### Correction du nom

L'ancien et le nouveau nom vont dans le journal (`corriger`, détail `{ champ, ancien, nouveau, nomRelu, statut }`), qui est en ajout seul : c'est l'historique du nom. Par défaut, le nom corrigé repasse **à relire** (`nom_a_verifier`). `nomRelu: true` : l'administrateur confirme avoir relu le nouveau nom.

Une fiche `pret_a_publier` ou `publiee` exige un nom relu (contrainte `pharmacie_publique_complete`) : la correction **exige** `nomRelu: true` (sinon `409 confirmation-requise`), et la fiche **reste publiée**. Le pharmacien ne change jamais le nom (déclencheur, même en SQL direct).

### Création d'une fiche (demande d'ajout)

Pour une demande de rattachement « ajout » (pharmacie absente de l'annuaire) encore en attente. La fiche naît **`en_attente_position`**, sans position, `sources = {saisie_admin}`, puis la demande lui est liée ; elle se valide ensuite par `POST /api/admin/rattachements/:id/valider`, et le pharmacien propose la position (Partie 8).

**Doublons probables** : fiches de la **même ville** (sans accents ni casse), hors fiches fusionnées, dont le nom normalisé a une similarité de trigrammes (`pg_trgm`) **≥ 0,5** (`ADMIN_SEUIL_DOUBLON`). S'il y en a, rien n'est créé : `409 doublons-probables` avec la liste (`id`, `nom`, `ville`, `statutPublication`, `similarite`). L'administrateur fusionne, fait réclamer la fiche existante, ou renvoie avec `confirmerSansDoublon: true` (journalisé avec les doublons signalés).

Base : `INSERT` accordé sur quelques colonnes seulement (nom, adresse, ville, code postal, gouvernorat, téléphone, sources), jamais la position ni le statut. Déclencheur `pharmacie_controle_creation` : seul un administrateur non suspendu crée une fiche, et toujours en attente de position.

### Fusion de deux fiches

Une fiche **conservée** (K) et une fiche **fusionnée** (F), en **une seule transaction** (tout ou rien). Les deux fiches sont verrouillées dans un ordre fixe (pas d'interblocage entre deux fusions).

| Élément de F | Effet |
|---|---|
| Fiche | `fusionnee`, `fusionnee_dans = K` (renvoi). Plus aucune modification par l'API (fiche, horaires, disponibilités), aucune transition de statut, plus jamais publiée |
| Disponibilités | Copiées vers K **si plus récentes** que celle de K ou absentes de K, avec leur date et leur déclarant d'origine ; sinon K garde la sienne. Celles de F restent sur F. Une déclaration dont le compte déclarant a été supprimé n'est pas copiée (elle reste sur F, comptée dans le bilan) |
| Suivis (sans statut) | Ajoutés à K s'il ne les suit pas |
| Historique des disponibilités et des positions, demandes de position | Restent sur F (ajout seul), avec le renvoi. La demande en attente devient `remplacee` |
| Horaires | Copiés vers K **si K n'en a aucun** ; ceux de F restent |
| Signalements, messages de contact | Rattachés à K |
| Rattachement validé de F | Passe à K si K n'en a pas ; sinon **retiré** (`pharmacie_attribuee`, « Fiche fusionnée avec une autre fiche. ») |
| Demandes de rattachement en attente | Passent à K (marquées en conflit si K a déjà un pharmacien ou une demande) |
| Alertes déclenchées, e-mails, fiche interne | Restent sur F (renvoi) |

Après la fusion, les alertes des patients sont recherchées sur K (nouvelles disponibilités). Une seule des deux fiches reste visible du public : F n'est plus `publiee` (si F était publiée et K ne l'est pas, la pharmacie disparaît du public jusqu'à la publication de K).

Le journal reçoit une ligne `fusionner` sur F et une sur K, avec le **bilan** (motif, statut d'avant de F, nombres) et, sous `rattrapage`, la liste de ce qui a été copié ou déplacé, et la valeur de K remplacée pour chaque disponibilité.

Refus : fusionner une fiche avec elle-même (`meme-fiche`), ou avec une fiche déjà fusionnée, dans un sens comme dans l'autre (`deja-fusionnee`). Dans la base, le statut `fusionnee` ne s'obtient que pendant une fusion menée par un administrateur, pour cette fiche (`mawjoud.fusion`) ; la copie d'une disponibilité vers K n'est acceptée que si elle reproduit exactement une déclaration de F.

#### Rattraper une fusion faite par erreur

Il n'y a **pas d'annulation automatique**. Un administrateur technique rattrape la fusion à la main, avec `psql` en superutilisateur sur la bonne base, à partir du bilan du journal. Seuls les scripts du serveur peuvent faire sortir une fiche de `fusionnee` (jamais l'API) ; les contraintes de la table s'appliquent toujours.

1. Lire le bilan : `GET /api/v1/admin/journal?action=fusionner&cibleId=<uuid de F>`.
2. Lancer le script ci-dessous (une transaction : tout ou rien). Il ne touche que ce qui **n'a pas changé depuis la fusion** : une disponibilité redéclarée depuis par le pharmacien de K n'est pas écrasée.

```sql
-- psql -v fusionnee=<uuid de F> -v admin=<e-mail de l'administrateur> -v motif='<raison>' -f rattrapage.sql
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('mawjoud.acteur_id', (SELECT id::text FROM prive.utilisateur
  WHERE lower(email) = lower(:'admin') AND role = 'administrateur' AND NOT suspendu), true);
CREATE TEMP TABLE r ON COMMIT DROP AS
  SELECT j.detail AS d, f.id AS f, k.id AS k
    FROM prive.journal_audit j
    JOIN annuaire.pharmacie f ON f.uuid = (j.detail->>'fusionnee')::uuid AND f.statut_publication = 'fusionnee'
    JOIN annuaire.pharmacie k ON k.uuid = (j.detail->>'conservee')::uuid
   WHERE j.action = 'fusionner' AND j.cible_id = :'fusionnee'
   ORDER BY j.id DESC LIMIT 1;
-- Arrêt si la fusion n'est pas trouvée (ou déjà rattrapée), ou si l'administrateur n'existe pas.
SELECT 1 / (SELECT count(*)::int FROM r) / (current_setting('mawjoud.acteur_id') <> '')::int;

-- 1. F reprend son statut d'avant et perd le renvoi.
UPDATE annuaire.pharmacie p SET statut_publication = r.d->>'statutAvant', fusionnee_dans = NULL FROM r WHERE p.id = r.f;
-- 2. Disponibilités copiées sur K et inchangées depuis : valeur d'avant rétablie, ou ligne retirée.
CREATE TEMP TABLE dispo ON COMMIT DROP AS
  SELECT m.id AS medicament_id, e->'avantSurK' AS avant
    FROM r CROSS JOIN LATERAL jsonb_array_elements(r.d->'rattrapage'->'disponibilites') e
    JOIN annuaire.medicament m ON m.uuid = (e->>'medicament')::uuid
    JOIN annuaire.stock sk ON sk.pharmacie_id = r.k AND sk.medicament_id = m.id
    JOIN annuaire.stock sf ON sf.pharmacie_id = r.f AND sf.medicament_id = m.id
   WHERE sk.declare_le = sf.declare_le AND sk.declare_par = sf.declare_par;
UPDATE annuaire.stock s SET statut = d.avant->>'statut', declare_le = (d.avant->>'declareLe')::timestamptz,
       declare_par = (d.avant->>'declarePar')::bigint
  FROM r, dispo d WHERE s.pharmacie_id = r.k AND s.medicament_id = d.medicament_id AND jsonb_typeof(d.avant) = 'object';
DELETE FROM annuaire.stock s USING r, dispo d
 WHERE s.pharmacie_id = r.k AND s.medicament_id = d.medicament_id AND jsonb_typeof(d.avant) = 'null';
DELETE FROM annuaire.stock s USING r, jsonb_array_elements_text(r.d->'rattrapage'->'suivis') e, annuaire.medicament m
 WHERE s.pharmacie_id = r.k AND m.uuid = e::uuid AND s.medicament_id = m.id AND s.statut IS NULL;
-- 3. Horaires copiés (K n'en avait pas) : ceux de K identiques à ceux de F sont retirés.
DELETE FROM annuaire.horaire h USING r
 WHERE h.pharmacie_id = r.k AND (r.d->'rattrapage'->>'horairesCopies')::boolean
   AND EXISTS (SELECT 1 FROM annuaire.horaire x
                WHERE x.pharmacie_id = r.f AND (x.jour, x.ouverture, x.fermeture) = (h.jour, h.ouverture, h.fermeture));
-- 4. Signalements, messages et rattachements déplacés reviennent sur F.
UPDATE prive.signalement x SET pharmacie_id = r.f FROM r
 WHERE x.uuid IN (SELECT e::uuid FROM jsonb_array_elements_text(r.d->'rattrapage'->'signalements') e);
UPDATE prive.message_contact x SET pharmacie_id = r.f FROM r
 WHERE x.uuid IN (SELECT e::uuid FROM jsonb_array_elements_text(r.d->'rattrapage'->'messages') e);
UPDATE prive.rattachement_pharmacien x SET pharmacie_id = r.f FROM r
 WHERE x.statut IN ('validee', 'en_attente')
   AND x.uuid IN (SELECT e::uuid FROM jsonb_array_elements_text(r.d->'rattrapage'->'rattachementsDeplaces') e);
-- 5. Journal.
INSERT INTO prive.journal_audit (acteur_id, action, cible_type, cible_id, detail)
SELECT current_setting('mawjoud.acteur_id')::bigint, 'rouvrir', 'pharmacie', r.d->>'fusionnee',
       jsonb_build_object('rattrapageFusion', true, 'conservee', r.d->>'conservee', 'motif', :'motif') FROM r;
COMMIT;
```

3. Ce qui reste à faire par l'interface : un rattachement **retiré** par la fusion reste retiré (historique) ; le pharmacien refait une demande, que l'administrateur valide. Une demande de position **remplacée** reste remplacée (ajout seul) ; le pharmacien en propose une nouvelle. Les disponibilités de K redéclarées depuis la fusion sont gardées telles quelles. Les entrées d'historique ajoutées à K par la fusion restent (ajout seul) : elles témoignent de la fusion et de son rattrapage.

### Suspension d'un compte

Motif obligatoire, journalisé (`suspendre`, `retablir`, avec le rôle, le motif et le nombre de sessions fermées). **Effet immédiat** : toutes les sessions du compte sont supprimées dans la même transaction (déconnexion). **Aucune donnée supprimée** : compte, rattachement, alertes, historique restent. Le compte peut se reconnecter et voir son état (`GET /api/comptes/moi` : `suspendu: true`), mais toute action est refusée (`403 compte-suspendu`), par l'API et par la base (Partie 5).

Un administrateur ne peut **pas se suspendre lui-même** (`soi-meme`), ni suspendre le **dernier administrateur actif** (`dernier-administrateur`). Les suspensions se font une à la fois (verrou), et l'administrateur qui agit est revérifié sous ce verrou : deux administrateurs qui se suspendent l'un l'autre en même temps ne peuvent pas laisser le site sans administrateur.

### Lecture

`GET /comptes` : `id`, `email`, `role`, `emailVerifie`, `suspendu`, `creeLe`, `pharmacie` (rattachée et validée, ou `null`). **Jamais** d'empreinte de mot de passe, de jeton ni de session.

`GET /journal` : `id`, `action`, `cibleType`, `cibleId`, `detail`, `creeLe`, `acteur` (`{ id, email }` ; `{ id: null, email: null, supprime: true }` si le compte a été supprimé depuis ; `null` pour une action du serveur). **Lecture seule** : aucune route d'écriture, et la base refuse toute modification ou suppression du journal au compte de l'API. Pagination : 50 entrées par page, 1 000 pages au plus (affiner avec les filtres au-delà).

## Tests

`backend/test/administration-generale.e2e-spec.ts` (30 tests, Partie 9c) : correction du nom (journal ancien et nouveau, nom à relire, confirmation obligatoire sur une fiche publiée qui reste publiée, pharmacien refusé même en SQL direct) ; création (doublon probable signalé sans rien créer, fiche sans position ni publication liée à la demande, gouvernorat inconnu, champs interdits, création refusée en SQL direct au pharmacien, sans acteur, avec position, statut ou source inventée) ; fusion (règles a à g : panne simulée en fin de fusion sans aucune trace, bilan et données de rattrapage, disponibilité la plus récente avec son déclarant, historique et demandes conservés, rattachements, signalements et horaires, fiche fusionnée figée y compris en SQL direct, personne ne la sort de `fusionnee` (ni `mawjoud_api` sans acteur, ni au nom d'un pharmacien ou d'un administrateur, même en annonçant une fusion, ni un administrateur ou un pharmacien par l'API), statut `fusionnee` inaccessible hors fusion, copie de disponibilité inventée refusée, aucune fiche en double dans la liste, la carte et la recherche publiques) ; suspension (motif, sessions fermées, données gardées, reconnexion sans action, réactivation, soi-même, dernier administrateur avec deux suspensions croisées, par l'API et par le service en parallèle) ; lecture (comptes filtrés sans secret, journal paginé et filtré, lecture seule en SQL direct, accès).

`backend/test/positions-admin.e2e-spec.ts` (30 tests, sur `mawjoud_test`) : chaque droit retiré ou resserré, tenté en SQL direct avec `mawjoud_api` (insertion, suppression, colonnes non accordées, pharmacien sans acteur, sur la pharmacie d'un autre, suspendu, patient, champs interdits, horaires) ; R9 sur les demandes (SQL et API) ; demandes en ajout seul ; demande, remplacement, proximité ; accès refusés ; position publique inchangée tant que la demande est en attente ou refusée ; validation (historique, journal, une seule fois) ; nom à relire ; circuit complet jusqu'à la liste, les proches et la carte publiques ; transitions interdites ; publication impossible sans position confirmée ou nom relu, y compris en SQL direct ; relecture ; une ligne de journal par décision ; limite de débit ; seuils lus dans la configuration.

Pour créer leurs fiches, les tests prennent le rôle `mawjoud_test_fixtures`, créé **uniquement** par `database/preparer-base-test.ps1` (jamais par une migration), avec `INSERT` dans `mawjoud_test` seulement (aucun droit dans `mawjoud`). **Sur un serveur de production, ce rôle ne doit pas exister** : `DROP ROLE mawjoud_test_fixtures;` s'il y a été créé.
