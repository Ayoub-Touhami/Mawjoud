import type { Request } from 'express';
import type { SessionOuverte } from './sessions.service.js';

/** Clés des métadonnées d'accès (lues par les gardes). */
export const CLE_ACCES = 'mawjoud:acces';
export const CLE_EMAIL_VERIFIE = 'mawjoud:email-verifie';
export const CLE_SUSPENDU_AUTORISE = 'mawjoud:suspendu-autorise';

export type Acces = 'public' | 'connecte' | 'patient' | 'pharmacien' | 'administrateur';

/** Ce que SecuriteGuard attache à la requête. */
export interface RequeteMawjoud extends Request {
  session?: SessionOuverte;
  jetonSession?: string;
}
