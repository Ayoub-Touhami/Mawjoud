# Rapport d'écarts — Mawjoud

Rapport écrit **avant toute correction de la partie 8**. La colonne « Suite » dit ce qui a été fait.
Écrans comparés aux pages du PDF `Mawjoud identité et écrans.pdf` : carte (4, 15, 16), résultats (5, 16),
fiche (6), créer une alerte (7), connexion (8), réclamation (9), espace pharmacien (10), e-mail (11).

## Méthode

- 72 captures : 6 écrans × 3 largeurs (360, 768, 1280 px) × clair et sombre × français et arabe.
- Sur chacune, mesures automatiques : débordement, contraste du texte, taille des cibles.
- Comparaison à l'œil d'un échantillon seulement, pas des 72 images : les écrans à 360 et 1280 px en français,
  puis un écran arabe et sombre, et le 768 px sur les résultats.
- Les captures sont dans `frontend/dist/captures` (ignoré par Git) ; `CAPTURES=1 npx playwright test e2e/captures.spec.ts`.

## Résultat des mesures

Sur les 72 captures : aucun débordement, contraste minimal de 4,95:1, aucune cible de moins de 44 px dans le contenu.

## 1. Bilingue et RTL

| Écart | Sévérité | Suite |
|---|---|---|
| Aucun texte d'écran public en dur dans les gabarits | — | Rien à corriger |
| Titre accessible de la carte figé dans la langue de départ | Moyenne | Corrigé |
| Durées arabes abrégées (« منذ 2 س »), alors que le PDF écrit « منذ ساعتين » | Moyenne | Corrigé, avec les pluriels de `Intl.PluralRules` : `Intl.RelativeTimeFormat` écrit « قبل » et non « منذ » comme le PDF |
| Noms et adresses latins dans des phrases arabes sans isolation bidirectionnelle | Moyenne | Corrigé (`bdi` et isolation des valeurs insérées) |
| Administration en police de titre arabe quand le site est en arabe | Faible | Corrigé |
| Mention de la source sur la carte en anglais (texte du fournisseur) | Faible | Volontaire : texte exigé par la licence |
| Textes de l'administration en français dans `ar.json` | — | Volontaire (partie 7) |
| Jeu de données : noms et adresses de pharmacies en lettres latines | — | Volontaire : donnée source |

## 1 bis. Écarts avec la spécification (modèle de données)

| Écart | Suite |
|---|---|
| F10 et R10 parlent d'une alerte par « ville » ; le front-end et la base utilisent le gouvernorat (`prive.alerte.gouvernorat_code`, vide = toutes les villes) | Volontaire, décidé le 8 novembre 2026 : on suit le front-end |

## 2. Fidélité visuelle

| Écart avec le PDF | Écran | Suite |
|---|---|---|
| Gélule inversée et mauvais vert sur l'icône d'application | Icône, favicon | Corrigé, images régénérées |
| Pointe du marqueur trop ronde | Marqueurs, logo | Corrigé |
| Motif sombre plus lumineux | Connexion, e-mail | Corrigé (opacité 30 %) |
| Nom arabe plus petit dans `logo-complet.svg` | Logo complet | Non corrigé : ce fichier n'est utilisé par aucun écran |
| Mention « données de test » absente de la carte | Tous | Corrigé par une bande fine ; écart volontaire avec le PDF |
| Bouton de menu dans la barre mobile | Carte | Volontaire : accès à Mes alertes et à l'administration |
| Pas de carte sur la liste de résultats du PDF ; feuille réductible ici | Résultats | Volontaire (décision 4 de la partie 4) |
| Groupe « médicament non déclaré », lien « Toutes les pharmacies », « Voir plus » | Résultats | Volontaires (partie 4) |
| Médicaments de démonstration : le PDF en affiche 3, la fiche jusqu'à 14 | Fiche | Volontaire : données de test |
| En-tête du site visible, bandeau de connexion sans logo | Connexion | Volontaire : navigation commune |
| En-tête du site visible, pas d'icône de compte | Espace pharmacien | Volontaire |
| Bouton « Retirer » sur chaque ligne | Espace pharmacien | Volontaire (décision 4 de la partie 6) |
| Illustrations « signal coupé » et « aucune pharmacie » simplifiées | États | Non corrigé : pas de fichier source fourni |
| Titre de l'e-mail : texte de la spécification, pas celui du PDF | E-mail | Volontaire (décision 7 de la partie 5) |
| Bordure de champ #78837C au lieu de ≈#8E9990 | Champs | Volontaire : le PDF donne ≈2,9:1, sous le seuil de 3:1 |

## 3. Accessibilité

| Écart | Suite |
|---|---|
| Pas de lien d'évitement vers le contenu | Corrigé |
| Mise à jour de stock réussie non annoncée aux lecteurs d'écran | Corrigé |
| Nombre de résultats non annoncé après un changement de zone | Corrigé |
| Le focus ne revient pas au résultat après fermeture de la feuille | Corrigé |
| Mes alertes, espace pharmacien : pas d'état d'erreur si le service échoue | Corrigé |
| Listes d'administration : pas d'état de chargement ni d'erreur | **Non corrigé**, noté dans `STATUT.md` |
| Vrai lecteur d'écran | Non testé : aucun outil disponible ici |

## 4. Inventaire des parcours (3 clics)

Voir `STATUT.md`. Un parcours dépasse 3 clics : valider un nom ambigu sans passer par une suggestion demande 4 clics pour appeler.

## 5. Après correction

72 captures refaites : aucun débordement, contraste minimal de 4,95:1, aucune cible de moins de 44 px.
