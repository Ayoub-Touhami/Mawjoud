/*
 * DONNÉES DE TEST INVENTÉES. Ces pharmacies n'existent pas : noms, adresses, téléphones,
 * horaires et états sont fictifs, et les positions sont seulement proches des villes citées.
 */
import { EtatPharmacie, Pharmacie, PlageHoraire } from '../models';

const SEMAINE: PlageHoraire[] = [
  { jours: [1, 2, 3, 4, 5, 6], ouverture: '08:00', fermeture: '20:00' },
];
const COUPURE: PlageHoraire[] = [
  { jours: [1, 2, 3, 4, 5], ouverture: '08:30', fermeture: '13:00' },
  { jours: [1, 2, 3, 4, 5], ouverture: '15:00', fermeture: '19:30' },
  { jours: [6], ouverture: '08:30', fermeture: '13:00' },
];
const TOUS_LES_JOURS: PlageHoraire[] = [
  { jours: [0, 1, 2, 3, 4, 5, 6], ouverture: '09:00', fermeture: '22:00' },
];

type Ligne = [string, string, string, number, number, EtatPharmacie, PlageHoraire[]];

const LIGNES: Ligne[] = [
  ['Pharmacie du Marché', '12, rue des Oliviers', 'Tunis', 36.8008, 10.1815, 'inscrite', SEMAINE],
  ['Pharmacie des Jardins', '5, rue des Jasmins', 'Tunis', 36.8125, 10.1742, 'inscrite', COUPURE],
  ['Pharmacie du Lac', '20, avenue du Lac', 'Tunis', 36.8334, 10.2341, 'inscrite', TOUS_LES_JOURS],
  ['Pharmacie de la Corniche', '3, rue de la Plage', 'Tunis', 36.8542, 10.3301, 'inscrite', SEMAINE],
  ['Pharmacie de la Gare', '8, place de la Gare', 'Tunis', 36.7953, 10.1806, 'non-inscrite', COUPURE],
  ['Pharmacie du Port', '41, avenue du Port', 'Tunis', 36.8061, 10.1963, 'non-inscrite', SEMAINE],
  ['Pharmacie des Orangers', '14, rue des Orangers', 'Ariana', 36.8665, 10.1647, 'inscrite', SEMAINE],
  ['Pharmacie de la Médina', '27, rue de la Médina', 'Ariana', 36.8601, 10.1934, 'reclamee', COUPURE],
  ['Pharmacie des Roses', '9, avenue des Roses', 'Ariana', 36.8742, 10.1812, 'non-inscrite', SEMAINE],
  ['Pharmacie du Stade', '2, rue du Stade', 'Ben Arous', 36.7531, 10.2189, 'inscrite', COUPURE],
  ['Pharmacie du Centre', '16, avenue Centrale', 'Ben Arous', 36.7472, 10.2305, 'non-inscrite', SEMAINE],
  ['Pharmacie de la Liberté', '4, avenue de la Liberté', 'Bizerte', 37.2746, 9.8739, 'inscrite', SEMAINE],
  ['Pharmacie du Vieux Port', '11, quai du Vieux Port', 'Bizerte', 37.2712, 9.8681, 'non-inscrite', COUPURE],
  ['Pharmacie des Palmiers', '30, rue des Palmiers', 'Nabeul', 36.4561, 10.7376, 'inscrite', TOUS_LES_JOURS],
  ['Pharmacie de la Poterie', '7, rue de la Poterie', 'Nabeul', 36.4493, 10.7291, 'non-inscrite', SEMAINE],
  ['Pharmacie de la Plage', '18, boulevard de la Plage', 'Sousse', 35.8288, 10.6405, 'inscrite', TOUS_LES_JOURS],
  ['Pharmacie du Ribat', '6, rue du Ribat', 'Sousse', 35.8256, 10.6369, 'inscrite', COUPURE],
  ['Pharmacie Sahloul', '22, avenue de Sahloul', 'Sousse', 35.8362, 10.5912, 'reclamee', SEMAINE],
  ['Pharmacie des Oliviers', '10, rue des Oliviers', 'Sousse', 35.8151, 10.6124, 'non-inscrite', COUPURE],
  ['Pharmacie de la Marina', '1, rue de la Marina', 'Monastir', 35.7781, 10.8312, 'inscrite', SEMAINE],
  ['Pharmacie du Mausolée', '13, rue du Mausolée', 'Monastir', 35.7705, 10.8267, 'non-inscrite', SEMAINE],
  ['Pharmacie des Remparts', '25, rue des Remparts', 'Sfax', 34.7406, 10.7603, 'inscrite', COUPURE],
  ['Pharmacie de la Mer', '19, avenue de la Mer', 'Sfax', 34.7338, 10.7712, 'inscrite', TOUS_LES_JOURS],
  ['Pharmacie Test Ancienne', '33, route du Sud', 'Sfax', 34.7212, 10.7365, 'reclamee', SEMAINE],
  ['Pharmacie Sakiet', '15, route de Sakiet', 'Sfax', 34.7619, 10.7481, 'non-inscrite', COUPURE],
  ['Pharmacie de la Grande Mosquée', '21, rue de la Mosquée', 'Kairouan', 35.6781, 10.1009, 'inscrite', SEMAINE],
  ['Pharmacie des Bassins', '8, avenue des Bassins', 'Kairouan', 35.6849, 10.0932, 'non-inscrite', COUPURE],
  ["Pharmacie de l'Oasis", "17, rue de l'Oasis", 'Gabès', 33.8869, 10.0982, 'inscrite', SEMAINE],
  ['Pharmacie des Mines', '6, avenue des Mines', 'Gafsa', 34.4251, 8.7842, 'non-inscrite', SEMAINE],
  ["Pharmacie de l'Île", "12, rue de l'Île", 'Djerba', 33.8751, 10.8574, 'non-inscrite', TOUS_LES_JOURS],
];

export const PHARMACIES_TEST: Pharmacie[] = LIGNES.map(
  ([nom, adresse, ville, latitude, longitude, etat, horaires], i) => ({
    id: `ph-${String(i + 1).padStart(2, '0')}`,
    nom,
    adresse,
    ville,
    telephone: `00 000 ${String(i + 1).padStart(3, '0')}`,
    horaires,
    latitude,
    longitude,
    etat,
    source: 'données de test inventées',
  }),
);
