# État du projet Mawjoud

État à la fin de la partie 8. **Tout est du front-end : il n'existe ni serveur, ni base de données, ni envoi d'e-mail.** « Terminé » veut dire que l'écran et sa logique fonctionnent et sont testés avec des données simulées, pas que le service est utilisable en vrai.

## Fonctions F1 à F13

| Fonction | État | Ce qui manque ou reste faible |
|---|---|---|
| F1 Carte de toutes les pharmacies | Terminé (simulé) | Données de test ; annuaire réel à fournir ; pas de fonctionnement après rechargement hors connexion |
| F2 Recherche d'un médicament et d'une ville | Terminé (simulé) | Choix par gouvernorat et non par ville ; liste réelle à fournir ; recherche en lettres arabes sans données |
| F3 Liste de résultats | Terminé (simulé) | Ordre de tri à confirmer (point 6) |
| F4 Fiche pharmacie | Terminé (simulé) | Affichage des horaires vu seulement sur une fiche corrigée à la main : le CSV n'en contient pas |
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
| Tests unitaires | 112 réussis |
| Tests de bout en bout | 54 réussis (`npm run e2e`) |
| Contraste minimal du texte, 72 captures | 4,95:1 |
| Fluidité, 3 000 marqueurs, processeur ralenti 4 fois | 39 à 40 images par seconde (95 % des images sous 50 ms) |
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
| Créer une alerte depuis les résultats | 1 |
| Mettre à jour un stock, depuis l'espace | 1 |
| Réclamer ma pharmacie | Parcours à étapes, avec création de compte |

## Simulé, à brancher au back-end

Tout se remplace dans `fournirSimulation()` et `fournirAdministration()` : les écrans ne voient que les interfaces.

| Interface | Implémentation simulée |
|---|---|
| `PharmacieApi` | `PharmacieApiMock`, annuaire `AnnuaireSimule` |
| `AuthService` | `AuthServiceSimule` (SHA-256 provisoire, session locale) |
| `AlertService` | `AlertServiceSimule` |
| `EvaluateurAlertes` | `EvaluateurAlertesSimule` (aucun e-mail) |
| `PharmacistAuthService` | `PharmacistAuthServiceSimule` |
| `ClaimService` | `ClaimServiceSimule` (nom et taille du fichier seulement) |
| `StockService` | `StockServiceSimule` |
| `AdminAuthService`, `AdminClaimService`, `AdminDirectoryService`, `AdminAbuseService`, `AuditLogService` | `admin.simule.ts` |

À faire côté serveur : authentification et hachage de mot de passe réels, contrôle des droits (les gardes actuelles guident seulement la navigation), envoi des e-mails et du gabarit, dépôt des justificatifs, géocodage des fiches créées. **Toutes les données vivent dans le navigateur : sans back-end, le site n'est pas utilisable à plusieurs.**

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
| 9 | Conservation après suppression de compte | Appliqué : suppression définitive. À confirmer. Le journal garde un identifiant de compte |
| 10 | Historique des déclarations | À décider. Rien n'est gardé |
| 11 | Plusieurs pharmacies par compte | À décider. Une seule |
| 12 | Ville pilote | À décider |
| 13 | Choix techniques | Angular et MapLibre avec OpenFreeMap retenus. Back-end, base, e-mails, hébergement à décider |
| 14 | Textes arabes et vocabulaire médical | À valider : `TEXTES_ARABES_A_RELIRE.xlsx` |
| 15 | Écrans non maquettés | Conçus ici : à valider |

## Autres décisions ouvertes

- Détail des actions d'abus, et origine des signalements : seules suspendre, rétablir et supprimer existent.
- Service worker pour le hors connexion : non ajouté.
- Données de test : noms et téléphones qui semblent réels à côté de stocks inventés. **Ne pas publier le site tel quel.**
