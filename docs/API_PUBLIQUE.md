# API publique de Mawjoud : recherche et carte (Partie 6)

Routes en lecture seule, sans compte, pour la carte, la recherche et les fiches. Préfixe `/api/v1`, méthode `GET` uniquement, documentées dans Swagger (`/api/docs`, en développement). Comptes et authentification : `docs/API_COMPTES.md`.

## Garanties

- **Seules les pharmacies publiées existent pour ces routes.** Elles ne lisent que les vues `publique.*`, qui ne montrent que le statut `publiee` (règle de `docs/DECISIONS_BASE_DE_DONNEES.md`) ; une fiche publiée a toujours une position confirmée, un nom relu, une ville et un gouvernorat (contrainte `pharmacie_publique_complete`).
- **Garanti par la base, pas seulement par le code** : chaque requête s'exécute dans une transaction en lecture seule, sous le rôle `mawjoud_lecture_publique` (migration 029). Une requête erronée ne pourrait ni lire `annuaire.*` ou `prive.*`, ni écrire quoi que ce soit (testé).
- **Aucun champ interne** : ni statut de publication, ni source brute (`source_gps`, `sources`, `id_source`, `code_source`), ni identifiant numérique, ni donnée de compte. Les identifiants sont des `uuid`.
- **Aucune session lue, aucun cookie posé** : les réponses peuvent être mises en cache sans risque.
- Requêtes paramétrées uniquement ; dans les recherches partielles, `%`, `_` et `\` saisis sont échappés (caractères ordinaires).

Dans la base de développement `mawjoud`, aucune pharmacie n'est encore publiée (755 sont `pret_a_publier`) : les listes sont vides. C'est normal ; les tests utilisent `mawjoud_test`.

## Routes

| Route | Paramètres | Réponse |
|---|---|---|
| `GET /v1/pharmacies` | `gouvernorat` (11 à 83), `ville`, `garde` (`true`, `false`), `nom` (2 caractères au moins), `page` (1 à 1 000), `taille` (1 à 50, défaut 20) | `{ elements, page, taille, total }`, triés par nom |
| `GET /v1/pharmacies/proches` | `lat` (30 à 38), `lng` (7 à 12), `rayon_km` (0,1 à 50, défaut 5), `limite` (1 à 50, défaut 20) | `{ elements (avec distanceKm), rayonKm }`, triés par distance |
| `GET /v1/pharmacies/carte` | `sud`, `ouest`, `nord`, `est` (bornes de la Tunisie, `sud ≤ nord`, `ouest ≤ est`), `zoom` (0 à 22) | `{ points: [{ id, nom, latitude, longitude, garde }], tronque, plafond: 500, zoom }` |
| `GET /v1/pharmacies/:id` | `id` (uuid) | fiche ; `404 introuvable` si absente ou non publiée |
| `GET /v1/medicaments` | `q` (2 à 100 caractères), `limite` (1 à 50) | `{ elements }`, par pertinence |
| `GET /v1/medicaments/:id/pharmacies` | `lat` et `lng` (ensemble, facultatifs), `limite` | `{ elements: [{ pharmacie, statut, declareLe }] }` ; `404` si médicament inconnu |
| `GET /v1/gouvernorats` | — | `{ elements: [{ code, nom, nombrePharmacies }] }` |
| `GET /v1/villes` | `gouvernorat` (facultatif) | `{ elements: [{ nom, gouvernorat, nombrePharmacies }] }` |

Paramètre inconnu, mal typé ou hors bornes : `400 { "erreur": "donnees-invalides", "champs": [...] }` (aucune valeur recopiée). Identifiant mal formé : 400 ; bien formé mais absent ou non publié : 404.

### Forme d'une pharmacie

Résumé (listes, proches, disponibilités) : `id`, `nom`, `rue`, `quartier`, `ville`, `gouvernorat: { code, nom }`, `telephone` (téléphone public de la pharmacie, ou `null` : « Téléphone non renseigné »), `latitude`, `longitude`, `garde` (`jour`, `nuit` ou `null`), `etat` (`inscrite`, `reclamee`, `non-inscrite`), et `distanceKm` (arrondie à 10 m) quand un point est donné.

Fiche (`/v1/pharmacies/:id`) : le résumé, plus `codePostal`, `telephonesAutres`, `horaires: [{ jour, ouverture, fermeture }]` (jour 0 = dimanche, heures `HH:MM`) et `sourceOpenStreetMap` : si vrai, afficher « © OpenStreetMap contributors » (licence ODbL).

### Choix de lecture

- **`garde`** (décision du 13 novembre 2026) : `garde=true` = pharmacies de nuit (`nuit`) ; `garde=false` = les autres (`jour` ou non renseigné). La valeur brute est dans chaque fiche.
- **`ville`** : égalité sans accents ni casse (« tunis » = « TUNIS »). **`nom`** : contient le texte, sans accents ni casse.
- **Médicaments** : nom commercial ou DCI ; ordre : égalité exacte, puis début, puis contenu, puis ressemblance (trigrammes : `amoxiciline` trouve « Amoxicilline »). Champs : `id`, `nomCommercial`, `dci`, `forme`, `dosage`, `categorie`, `nomAr`, `dciAr`, `donneeTest` (bande « données de test »).
- **Disponibilités** : vue `publique.stock` (pharmacies publiées **et inscrites**, R7 ; médicaments actifs). Statuts renvoyés : `disponible` et `quantite-limitee` (`en-rupture` exclu : « qui ont ce médicament disponible »). Tri : déclaration la plus récente d'abord, ou distance si `lat` et `lng` sont donnés.
- **« À confirmer » (R6, 24 h)** n'est pas calculé par l'API : cette règle n'existe pas en base. L'API renvoie `declareLe` ; le front-end applique `FraicheurService`, seule source de la règle.
- **Carte** : 500 points au plus, dans un ordre stable ; `tronque: true` signale qu'il y en a davantage (zoomer). `zoom` est contrôlé mais pas utilisé : pas de regroupement pour l'instant (noté dans `STATUT.md`, « À faire plus tard »).

## Distance sans PostGIS

PostGIS n'est pas installé (ni disponible sur le serveur). La recherche par distance :

1. calcule la boîte englobante du cercle (1° de latitude ≈ 111,32 km ; longitude corrigée par le cosinus de la latitude) ;
2. filtre par cette boîte, avec l'index `pharmacie_publiee_position` (latitude, longitude) des fiches publiées (migration 029) ;
3. calcule la distance exacte (formule de haversine, rayon terrestre 6 371 km) en SQL et ne garde que celles dans le rayon, triées.

Les comparaisons `>=` et `<=` sur les coordonnées traversent la vue protégée (`security_barrier`) ; l'opérateur géométrique `<@` de l'ancien index GiST `pharmacie_carte` ne le peut pas, d'où le nouvel index (`pharmacie_carte` est gardé pour l'administration). Avec des statistiques à jour, `EXPLAIN` montre `Bitmap Index Scan on pharmacie_publiee_position`.

Les statistiques ne se mettent pas à jour seules juste après une écriture en masse. `annuaire.analyser_annuaire()` (migration 030) lance `ANALYZE` sur l'annuaire : sous PostgreSQL 16, seul le propriétaire des tables peut le faire, d'où cette fonction à droits élevés mais à portée fixe (aucun paramètre), exécutable par l'application seulement. Les tests l'appellent après l'insertion de leurs données ; à prévoir aussi après une publication en masse.

## Limitation et cache

- 120 requêtes par minute et par IP sur ces routes (en mémoire, comme les comptes : à déplacer en base avec plusieurs instances), `429 trop-de-tentatives` avec `Retry-After`.
- `Cache-Control` : gouvernorats et villes `public, max-age=3600` ; pharmacies, carte, fiches et recherche de médicaments `public, max-age=300` ; disponibilités `public, max-age=60`.

## Tests

`backend/test/publique.e2e-spec.ts` (38 tests, sur `mawjoud_test`) crée son jeu de données : 4 pharmacies publiées (Tunis, Ariana, Sfax), 3 cachées tout près du centre de recherche (`en_attente_position`, `a_relire`, `pret_a_publier`), des disponibilités variées déclarées par de vrais pharmaciens rattachés, puis 520 fiches publiées pour le plafond de la carte. Vérifie : aucune fiche non publiée dans aucune route, 404 sur leur fiche, positions renvoyées toujours confirmées, tri et rayon des distances (comparés à un calcul indépendant), boîte et plafond, accents et casse, échappement de `%` et `_`, paramètres invalides (400), aucun champ interne, aucun cookie, lecture seule et rôle `mawjoud_lecture_publique` (écriture et tables privées refusées par la base), limitation de débit, utilisation de l'index `pharmacie_publiee_position` après `ANALYZE`.
