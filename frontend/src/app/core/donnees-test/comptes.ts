/*
 * COMPTES, DEMANDES ET SIGNALEMENTS DE TEST INVENTÉS, pour essayer l'administration. Ces comptes
 * n'ont aucun mot de passe et ne se connectent pas par le formulaire. Le domaine .example est
 * réservé et n'envoie aucun courrier.
 */
import { DemandeReclamation, Pharmacie, Signalement, Utilisateur } from '../models';
import { PHARMACIES_TEST } from './pharmacies';

export const COMPTES_TEST: Utilisateur[] = [
  { id: 'u-01', email: 'patient.verifie@mawjoud.example', role: 'patient', emailVerifie: true },
  { id: 'u-02', email: 'patient.attente@mawjoud.example', role: 'patient', emailVerifie: false },
  {
    id: 'u-03',
    email: 'pharmacien.verifie@mawjoud.example',
    role: 'pharmacien',
    emailVerifie: true,
    compteVerifie: true,
    pharmacieId: 'T001',
  },
  {
    id: 'u-04',
    email: 'pharmacien.attente@mawjoud.example',
    role: 'pharmacien',
    emailVerifie: true,
    compteVerifie: false,
  },
  {
    id: 'u-05',
    email: 'pharmacien.nouveau@mawjoud.example',
    role: 'pharmacien',
    emailVerifie: true,
    compteVerifie: false,
  },
  { id: 'u-06', email: 'admin@mawjoud.example', role: 'administrateur', emailVerifie: true },
  {
    id: 'u-07',
    email: 'pharmacien.concurrent@mawjoud.example',
    role: 'pharmacien',
    emailVerifie: true,
    compteVerifie: false,
  },
  {
    id: 'u-08',
    email: 'pharmacien.ajout@mawjoud.example',
    role: 'pharmacien',
    emailVerifie: true,
    compteVerifie: false,
  },
];

export const DEMANDES_TEST: DemandeReclamation[] = [
  {
    id: 'dem-01',
    pharmacieId: 'T004',
    pharmacienId: 'u-04',
    etat: 'en-attente',
    creeeLe: '2026-11-03T09:30:00.000Z',
    justificatif: {
      texte: 'Exemple de test : premier demandeur.',
      fichier: { nom: 'justificatif-test.pdf', taille: 120000 },
    },
  },
  {
    id: 'dem-02',
    pharmacieId: 'T005',
    pharmacienId: 'u-05',
    etat: 'en-attente',
    creeeLe: '2026-11-04T14:05:00.000Z',
  },
  {
    id: 'dem-03',
    pharmacieId: 'T006',
    pharmacienId: 'u-05',
    etat: 'refusee',
    creeeLe: '2026-11-01T10:00:00.000Z',
    motifCode: 'justificatif-illisible',
    motifPrecision: 'Exemple de test.',
  },
  {
    id: 'dem-04',
    pharmacieId: 'T004',
    pharmacienId: 'u-07',
    etat: 'en-attente',
    creeeLe: '2026-11-04T16:20:00.000Z',
    conflit: true,
    justificatif: { texte: 'Exemple de test : second demandeur.' },
  },
  {
    id: 'dem-05',
    pharmacieId: null,
    pharmacienId: 'u-08',
    etat: 'en-attente',
    creeeLe: '2026-11-05T08:45:00.000Z',
    ajout: {
      nom: 'Pharmacie de test (ajout)',
      adresse: '1, rue de test',
      ville: 'Tunis',
      telephone: '71000000',
    },
  },
];

const ORIGINAL_DOUBLON = PHARMACIES_TEST.find((p) => p.id === 'T002') as Pharmacie;

/** Copie volontaire d'une fiche, pour essayer la fusion. */
export const DOUBLON_TEST: Pharmacie = {
  ...ORIGINAL_DOUBLON,
  id: 'T-DOUBLON',
  nom: `${ORIGINAL_DOUBLON.nom} (doublon de test)`,
  etat: 'non-inscrite',
  source: 'Doublon de test inventé',
};

export const SIGNALEMENTS_TEST: Signalement[] = [
  {
    id: 'sig-01',
    compteId: 'u-03',
    pharmacieId: 'T001',
    texte: 'Exemple de test : stock déclaré disponible, mais médicament absent.',
    creeLe: '2026-11-05T11:00:00.000Z',
    donneeTest: true,
  },
];
