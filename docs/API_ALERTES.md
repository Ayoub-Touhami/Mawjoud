# API de Mawjoud : alertes, rappels et tâche planifiée (Partie 9b)

Un patient est prévenu par e-mail quand un médicament devient disponible (F10, F11, F12). Une pharmacie qui ne met plus à jour ses disponibilités reçoit un rappel. Une tâche planifiée simple envoie les e-mails et efface ce qui ne doit pas être gardé. Préfixe `/api/v1`, documenté dans Swagger (`/api/docs`, en développement).

## Vie privée (décisions du 13 novembre 2026)

Associer une adresse e-mail à un médicament révèle une information de santé. Donc :

- **Compte patient avec e-mail vérifié obligatoire** (R2, F10) : aucune alerte pour un visiteur sans compte (la spécification a écarté « les alertes sans compte »).
- **Consentement explicite** à chaque alerte (`consentement: true`), daté en base (`prive.alerte.consentement_le`).
- **Données minimales** : le compte, le médicament, le gouvernorat (ou « toutes les villes »). Rien d'autre.
- **Effacement** : une alerte supprimée par le patient ou arrêtée par le lien de désinscription est effacée tout de suite ; une alerte déclenchée est effacée **30 jours** après (purge de la tâche planifiée), avec la trace de son e-mail.
- **Jamais de médicament** dans le journal d'audit, dans les journaux du serveur ni dans le **sujet** des e-mails (il s'affiche sur un écran verrouillé) : le nom n'apparaît que dans le corps.
- **Désinscription en un clic**, sans connexion, par un lien présent dans **chaque** e-mail d'alerte (R12).
- **Plafond** : 20 alertes actives par compte (par défaut).

## Alertes du patient

Rôle patient, e-mail vérifié, session, jeton CSRF sur les écritures. 60 requêtes par minute et par compte.

| Méthode et route | Corps | Réponse |
|---|---|---|
| `GET /alertes` | — | `{ elements }` : actives, puis terminées |
| `POST /alertes` | `{ medicamentId, gouvernorat (11 à 83 ou null), consentement: true }` | `200 { alerte, existante }` ; `409 trop-d-alertes` |
| `PATCH /alertes/:id` | `{ gouvernorat }` | `200` l'alerte ; `409 doublon` ; `409 deja-decidee` si terminée |
| `DELETE /alertes/:id` | — | `204` (effacée) ; `404` si elle n'est pas à moi |
| `POST /alertes/desabonnement` | `{ jeton }` | `200 { alertesArretees }`, sans connexion ; `400 lien-invalide` |

Une alerte = `{ id, medicament { id, nomCommercial, dci, forme, dosage }, gouvernorat { code, nom } ou null, etat (active, terminee), creeeLe, declencheeLe? }`. Créer une alerte qui existe déjà (même médicament, même lieu) renvoie celle-ci avec `existante: true` (F10), sans en créer une seconde.

**Lieu : le gouvernorat** (décision du 13 novembre 2026), comme la base et `/api/v1/gouvernorats`. Le front-end, qui envoyait une ville, s'adaptera (Partie 9e).

### Déclenchement (F11, R11)

Après chaque déclaration d'un pharmacien (unitaire, en lot, « tout confirmer ») et à la publication d'une pharmacie par l'administrateur : chaque alerte **active** pour ce médicament, dont le lieu correspond (même gouvernorat, ou « toutes les villes »), passe à `terminee` si la disponibilité est **visible du public** (pharmacie publiée et inscrite, statut `disponible` ou `quantite_limitee` ; `en_rupture` ne déclenche rien) et si le compte est vérifié et non suspendu. **Un seul e-mail par alerte** (index unique de `prive.envoi_email`), envoyé juste après, en arrière-plan ; en cas d'échec, la tâche planifiée réessaie.

Lien de désinscription : un jeton par e-mail (décision du 13 novembre 2026 ; empreinte SHA-256 seulement, `prive.jeton`, sans aucun texte libre donc sans nom de médicament), valable tant que le compte existe et **effacé avec le compte** (`ON DELETE CASCADE`, comme les alertes et la trace des e-mails ; testé) ; il efface toutes les alertes **actives** de l'adresse. Lien : `FRONT_URL/compte/desabonnement?jeton=…` (le front-end retire le jeton de l'adresse après lecture, `docs/API_COMPTES.md`).

## Côté pharmacien

Ajouts à `docs/API_PHARMACIEN.md` :

| Méthode et route | Réponse |
|---|---|
| `GET /pharmacien/pharmacies/:id/suivis` | `{ elements }` : identifiants des médicaments suivis, déclarés ou non |
| `PUT /pharmacien/pharmacies/:id/suivis/:medicamentId` | `{ nouveau }` : suivre sans déclarer (ligne de stock sans statut) |
| `POST /pharmacien/pharmacies/:id/disponibilites/confirmer-tout` | `{ confirmees, elements }` : « tout est à jour » |

- **Suivre** (`suivreMedicament` du front-end) : le médicament apparaît dans la liste de travail de la pharmacie sans statut, donc invisible du public. Arrêter le suivi : `DELETE …/disponibilites/:medicamentId`. La base vérifie que l'acteur est le pharmacien de cette pharmacie (déclencheur `stock_suivi`, migration 034).
- **Tout confirmer** (`confirmerTout`) : chaque statut déclaré est redéclaré à la date du serveur, **sans changer de statut**, en une transaction ; chaque ligne passe dans l'historique ; une entrée de journal `confirmer_tout` (nombre de déclarations). Les alertes sont ensuite évaluées.

## Rappels aux pharmacies

Une pharmacie **publiée et inscrite** dont aucune disponibilité n'a été mise à jour depuis **N jours** (`ALERTE_RAPPEL_JOURS`, 7 par défaut ; si elle n'a jamais rien déclaré, N jours après la validation de son rattachement) reçoit un e-mail à son pharmacien (vérifié, non suspendu) : « pensez à mettre à jour », avec le lien vers l'espace pharmacien. **Au plus un rappel par période de N jours.** Préparé et envoyé par la tâche planifiée ; type `rappel_mise_a_jour` dans `prive.envoi_email`.

## E-mails

Console en développement, Brevo en production (interface prête, `docs/API_COMPTES.md`). La langue du patient n'étant pas enregistrée (R13), les e-mails d'alerte et de rappel sont **en français et en arabe** dans le même message. Chaque envoi est tracé dans `prive.envoi_email` (type, destinataire, pharmacie, statut, essais, nom de la dernière erreur ; jamais le contenu). Échec : nouvel essai plus tard (5, 10, 20… minutes), puis `abandonne` après `ALERTE_ESSAIS_MAX` essais (5 par défaut).

**Envoi interrompu (accepté, décision du 13 novembre 2026)** : avant d'envoyer, la tâche repousse l'heure du prochain essai de 10 minutes. Si le serveur s'arrête au milieu d'un envoi, l'e-mail reste « à envoyer » et la tâche planifiée le reprend environ 10 minutes plus tard. Conséquence possible : un e-mail parti juste avant l'arrêt, sans que sa réussite ait été enregistrée, peut être envoyé une seconde fois. Aucun e-mail n'est perdu en silence ; au pire, il est doublé.

## Tâche planifiée

Une commande, une passe, puis elle s'arrête : **rappels**, **envoi des e-mails en attente** (alertes et rappels, avec nouveaux essais), **purge** des alertes déclenchées depuis plus de `ALERTE_PURGE_JOURS` (30). Aucun service externe. Elle n'affiche que des nombres (ni adresse, ni médicament) ; code de sortie 0 (tout envoyé), 2 (des échecs, réessayés plus tard) ou 1 (erreur).

```powershell
cd backend
npm run taches
```

**Windows** (Planificateur de tâches), toutes les heures :

```powershell
schtasks /Create /SC HOURLY /TN "Mawjoud - taches" /TR "cmd /c cd /d \"C:\chemin\vers\mawjoud\backend\" && npm run taches >> taches.log 2>&1"
```

**Linux** (`crontab -e`), toutes les heures :

```
0 * * * * cd /chemin/vers/mawjoud/backend && npm run taches >> taches.log 2>&1
```

Elle utilise `API_DATABASE_URL` (compte `mawjoud_api`), comme le serveur.

## Configuration

| Variable | Défaut | Bornes | Rôle |
|---|---|---|---|
| `ALERTE_RAPPEL_JOURS` | 7 | 1 à 90 | N jours sans mise à jour avant un rappel ; un rappel au plus par période |
| `ALERTE_PURGE_JOURS` | 30 | 1 à 365 | Effacement des alertes déclenchées |
| `ALERTE_ESSAIS_MAX` | 5 | 1 à 20 | Essais d'envoi avant abandon |
| `ALERTE_MAX_PAR_COMPTE` | 20 | 1 à 200 | Alertes actives au plus par compte |

## Base (migration 034)

Consentement daté sur `prive.alerte` ; un jeton de désinscription par e-mail (l'index « un par compte » de 006 est retiré) ; type `rappel_mise_a_jour` ; suivi d'un médicament contrôlé par la base ; action de journal `confirmer_tout`.

## Tests

`backend/test/alertes.e2e-spec.ts` (14 tests, sur `mawjoud_test`) : consentement, compte vérifié, rôle ; création et alerte existante ; lieu, doublon, suppression ; plafond ; déclenchement dans le bon gouvernorat avec un seul e-mail, sujet sans médicament, lien de désinscription ; rien pour « en rupture » ni pour une pharmacie non publiée, jusqu'à sa publication ; désinscription sans connexion, lien toujours valable, empreinte seule en base ; aucun médicament dans le journal ; suivi pharmacien (R9 en API et en base) ; « tout confirmer » ; rappel au plus un par période ; nouvel essai puis abandon ; purge à 30 jours ; limitation de débit.
