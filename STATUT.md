# État du projet Mawjoud

État à la fin de la partie 8. **Tout est du front-end : il n'existe ni serveur, ni base de données, ni envoi d'e-mail.** « Terminé » veut dire que l'écran et sa logique fonctionnent et sont testés avec des données simulées, pas que le service est utilisable en vrai.

## Fonctions F1 à F13

| Fonction | État | Ce qui manque ou reste faible |
|---|---|---|
| F1 Carte de toutes les pharmacies | Terminé (simulé) | Données de test ; annuaire réel à fournir ; pas de fonctionnement après rechargement hors connexion |
| F2 Recherche d'un médicament et d'une ville | Terminé (simulé) | Choix par gouvernorat et non par ville ; liste réelle à fournir ; recherche en lettres arabes sans données |
| F3 Liste de résultats | Terminé (simulé) | Ordre de tri à confirmer (point 6) |
| F4 Fiche pharmacie | Terminé (simulé) | Horaires : calcul testé, affichage jamais vérifié à l'écran, car le CSV n'en contient pas |
| F5 Compte pharmacien, réclamation, vérification | Terminé (simulé) | Fichier justificatif non envoyé ; méthode de vérification non décidée |
| F6 Mise à jour du stock | Terminé (simulé) | Moins de 15 secondes non mesuré avec une vraie personne |
| F7 « À confirmer » après 24 h | Terminé | Règle réunie dans `FraicheurService`, testée avec une horloge simulée |
| F8 Administration de l'annuaire | Partiel | Écrans et actions faits ; pas de chargement ni d'erreur affichés sur les listes si un vrai service échoue ; signalements de test seulement |
| F9 Compte patient | Partiel | Aucun e-mail réel : la vérification passe par un lien de test, absent de la production |
| F10 Alerte de disponibilité | Terminé (simulé) | Déclenchement réel à brancher |
| F11 Envoi de l'e-mail d'alerte | Partiel | Gabarit visuel seulement. Aucun envoi. À transposer pour les messageries |
| F12 Désabonnement et suppression | Terminé (simulé) | Le lien agit à l'ouverture : à protéger des robots de messagerie côté serveur |
| F13 Français et arabe | Partiel | Écrans publics traduits et RTL testés. **Textes arabes non validés.** Administration en français par décision |

## Non testé

- Vrai téléphone : la fluidité est mesurée sur PC, avec le processeur ralenti 4 fois.
- Lecteur d'écran réel. Les rôles et les annonces sont en place, mais personne ne les a écoutés.
- Autres navigateurs que Chrome.
- Vraies messageries pour l'e-mail d'alerte.
- Environ 2 000 pharmacies réelles : testé avec 3 000 points de test injectés.
- Comparaison visuelle : 72 captures mesurées automatiquement, seul un échantillon a été regardé.

## Mesures

| Mesure | Résultat |
|---|---|
| Tests unitaires | 120 réussis |
| Tests de bout en bout | 65 réussis (`npm run e2e`) |
| Contraste minimal du texte, 72 captures | 4,95:1 |
| Fluidité, 3 000 marqueurs, processeur ralenti 4 fois | 39 à 57 images par seconde selon les essais (95 % des images sous 50 ms) |
| Saut de mise en page | 0,05 (seuil courant : 0,1) |
| Chargement initial | 403 ko, soit 102 ko transférés |
| MapLibre, à la demande | 1,11 Mo, soit 246 ko transférés, plus 508 ko pour son fichier de travail |
| Administration, à la demande | 63 ko, soit 11 ko transférés |
| Espace pharmacien, à la demande | 42 ko, soit 9 ko transférés |

Les libellés de l'administration restent dans `fr.json`, chargé par tous : ce sont des textes, pas du code ni des données. Le code d'administration, lui, n'est pas chargé pour les autres comptes.

## Règle des 3 clics

| Parcours | Clics |
|---|---|
| Voir une pharmacie | 1 |
| Appeler depuis la carte | 2 |
| Chercher, résultat, appeler | 3 en passant par une suggestion ; **4 si le nom reste ambigu et qu'on valide sans suggestion** |
| Mes alertes, sur mobile | 2 (menu, lien) |
| À propos ou Contact | 1 sur ordinateur et depuis le pied de page, 2 sur mobile (menu, lien) |
| Signaler une erreur depuis une fiche | 1 |
| Créer une alerte depuis les résultats | 1 |
| Mettre à jour un stock, depuis l'espace | 1 |
| Réclamer ma pharmacie | Parcours à étapes, avec création de compte |

## Simulé, à brancher au back-end

Tout se remplace dans `fournirSimulation()` et `fournirAdministration()` : les écrans ne voient que les interfaces.

| Interface | Implémentation simulée |
|---|---|
| `PharmacieApi` | `PharmacieApiMock`, annuaire `AnnuaireSimule` |
| `ContactService` | `ContactServiceSimule` (mémoire et localStorage : personne ne reçoit le message) |
| `AuthService` | `AuthServiceSimule` (SHA-256 provisoire, session locale) |
| `AlertService` | `AlertServiceSimule` |
| `EvaluateurAlertes` | `EvaluateurAlertesSimule` (aucun e-mail) |
| `PharmacistAuthService` | `PharmacistAuthServiceSimule` |
| `ClaimService` | `ClaimServiceSimule` (nom et taille du fichier seulement) |
| `StockService` | `StockServiceSimule` |
| `AdminAuthService`, `AdminClaimService`, `AdminDirectoryService`, `AdminAbuseService`, `AuditLogService` | `admin.simule.ts` |

À faire côté serveur : réception et traitement des messages de contact (aucun écran d'administration n'est prévu pour eux, ni limite contre les envois abusifs), authentification et hachage de mot de passe réels, contrôle des droits (les gardes actuelles guident seulement la navigation), envoi des e-mails et du gabarit, dépôt des justificatifs, géocodage des fiches créées. **Toutes les données vivent dans le navigateur : sans back-end, le site n'est pas utilisable à plusieurs.**

## Spécification, section 15 : points encore à décider

| N° | Point | État |
|---|---|---|
| 1 | Source de l'annuaire et licence | À décider. `pharmacies_goafricaonline.csv` n'a pas de GPS et sa licence n'est pas vérifiée |
| 2 | Source de la liste des médicaments | À décider. 40 médicaments de test |
| 3 | Vérification des pharmaciens | À décider |
| 4 | Pharmacie inscrite sans déclaration | Tranché par vous (partie 4) : affichée avec « non déclaré » |
| 5 | Déclenchement de l'alerte | Tranché par vous (partie 5) : « Disponible » seul, alerte terminée après envoi |
| 6 | Ordre de tri | Tranché par vous (partie 4) : distance, sinon gouvernorat |
| 7 | Position de l'utilisateur | Appliqué : en mémoire seulement. Conservation à confirmer côté serveur |
| 8 | Mot de passe oublié | À décider. Page d'attente |
| 9 | Conservation après suppression de compte | Appliqué : suppression définitive. À confirmer. Confidentialité : `journal_audit`, `historique_position` et `historique_stock` gardent l'identifiant numérique du compte qui a agi, sans clé étrangère ; il reste après la suppression du compte, sans e-mail ni autre donnée |
| 10 | Historique des déclarations | À décider. Rien n'est gardé |
| 11 | Plusieurs pharmacies par compte | À décider. Une seule |
| 12 | Ville pilote | À décider |
| 13 | Choix techniques | Angular et MapLibre avec OpenFreeMap retenus. Back-end, base, e-mails, hébergement à décider |
| 14 | Textes arabes et vocabulaire médical | À valider : `TEXTES_ARABES_A_RELIRE.xlsx` |
| 15 | Écrans non maquettés | Conçus ici, y compris Contact et À propos : à valider |

## Autres décisions ouvertes

- Coordonnées publiques : aucune n'est inventée. E-mail, téléphone et adresse restent « à renseigner » dans `frontend/src/app/core/coordonnees.config.ts`, seul fichier à remplir.
- L'arborescence prévoit une page unique « À propos et contact » : elle est séparée en deux pages à votre demande. Le diaporama cite aussi des « mentions » dans le pied de page : cette page n'existe pas.
- Détail des actions d'abus, et origine des signalements : seules suspendre, rétablir et supprimer existent.
- Service worker pour le hors connexion : non ajouté.
- Données de test : noms et téléphones qui semblent réels à côté de stocks inventés. **Ne pas publier le site tel quel.**

## Back-end : API publique (Partie 6)

- Recherche et carte en lecture seule, sans compte : `/api/v1/pharmacies` (liste, `proches`, `carte`, fiche), `/api/v1/medicaments` (recherche, disponibilités), `/api/v1/gouvernorats`, `/api/v1/villes`. Détail : `docs/API_PUBLIQUE.md`.
- Seules les pharmacies `publiee` sortent ; dans `mawjoud`, il n'y en a aucune pour l'instant (755 `pret_a_publier`) : les listes sont vides en développement, c'est normal. Aucun statut n'a été changé pour une démonstration.
- Migration **029** (la **028 reste réservée** à la règle R9 de la Partie 8) : rôle de lecture publique pour l'API, index des positions publiées. PostGIS n'est pas installé : distance par boîte englobante indexée puis haversine en SQL. L'ancien index GiST `pharmacie_carte` est gardé pour l'administration.
- Migration **030** : `annuaire.analyser_annuaire()`, ANALYZE de l'annuaire exécutable par l'application (SECURITY DEFINER, portée fixe) ; utilisée par les tests après l'insertion de leurs données, et utile après une publication en masse.
- Disponibilités : seulement `disponible` et `quantite-limitee` (`en-rupture` n'est pas renvoyé, décision du 13 novembre 2026).
- « À confirmer » (R6) reste calculé par le front-end (`FraicheurService`) à partir de `declareLe`.
- 86 tests Jest, sur `mawjoud_test`.

## À faire plus tard

1. **Juste avant la Partie 9 : catalogue de référence de 200 médicaments.** Créer `../data/final/medicaments_200.csv` (hors du dépôt ; le fichier n'existe pas encore au 13 novembre 2026), puis l'importer dans `annuaire.medicament`. Liste par DCI, sans marque inventée, hors nomenclature officielle (son accès et sa licence restent à vérifier), à faire relire par un pharmacien avant tout usage. Les 40 lignes de test (`donnee_test`) sont gardées.
2. **Avec la Partie 8 : migration 028, règle R9 pour `prive.demande_position`.** **Elle doit rester indépendante des migrations 029 et 030** : sur `mawjoud`, où 029 et 030 sont déjà passées, le script l'appliquera après elles ; sur une base neuve (`mawjoud_test`), avant. Aujourd'hui, la base vérifie que le demandeur est pharmacien et non suspendu (027), mais pas qu'il est rattaché (rattachement validé) à la pharmacie dont il propose la position. La migration 028 ajoute ce contrôle, avec un test qui prouve qu'un pharmacien ne peut pas proposer une position pour une pharmacie à laquelle il n'est pas rattaché.
3. **Carte : regroupement des points selon le zoom.** Aujourd'hui, `GET /api/v1/pharmacies/carte` contrôle `zoom` (0 à 22) sans s'en servir : 500 points au plus, avec l'indicateur `tronque`. Décider du regroupement (côté serveur, ou côté MapLibre avec ses grappes) quand le nombre de pharmacies publiées le demandera.
4. **Avant la Partie 9 (connexion du front-end) : base de démonstration séparée `mawjoud_demo`** (décision du 13 novembre 2026). Mêmes migrations que `mawjoud`, données de démonstration clairement marquées « données de test », supprimable d'un coup (`DROP DATABASE`), sur le modèle de `mawjoud_test`. On n'installe pas de fausses fiches dans `mawjoud`, et on ne suspend pas les déclencheurs. Le premier script préparé pour `mawjoud` (`database/demo/`, ignoré par Git, jamais lancé) sera remplacé ; `mawjoud_demo` devra être ajoutée à la liste des bases acceptées par les scripts, avec les mêmes garde-fous.
