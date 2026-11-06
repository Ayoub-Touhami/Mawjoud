/*
 * COMPTES DE TEST INVENTÉS. Aucun secret n'est stocké ici : la simulation ne regarde que
 * l'adresse e-mail. Le domaine .example est réservé et n'envoie aucun courrier.
 */
import { Alerte, DemandeReclamation, Utilisateur } from '../models';

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
    pharmacieId: 'T004',
  },
  {
    id: 'u-05',
    email: 'pharmacien.nouveau@mawjoud.example',
    role: 'pharmacien',
    emailVerifie: true,
    compteVerifie: false,
  },
  { id: 'u-06', email: 'admin@mawjoud.example', role: 'administrateur', emailVerifie: true },
];

export const ALERTES_TEST: Alerte[] = [
  { id: 'al-01', utilisateurId: 'u-01', medicamentId: 'med-19', ville: 'Tunis', etat: 'active' },
  { id: 'al-02', utilisateurId: 'u-01', medicamentId: 'med-41', ville: null, etat: 'active' },
  { id: 'al-03', utilisateurId: 'u-01', medicamentId: 'med-31', ville: 'Sfax', etat: 'terminee' },
];

export const DEMANDES_TEST: DemandeReclamation[] = [
  {
    id: 'dem-01',
    pharmacieId: 'T004',
    pharmacienId: 'u-04',
    etat: 'en-attente',
    creeeLe: '2026-11-03T09:30:00.000Z',
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
    motifRefus: 'Justificatif illisible (exemple de test).',
  },
];
