import { InjectionToken, Signal } from '@angular/core';
import { Observable } from 'rxjs';
import { Utilisateur } from '../models';

/**
 * Comptes pharmaciens. La connexion est commune à tous les comptes (AuthService) ; un compte a
 * un seul rôle et, pour l'instant, une seule pharmacie : le rattachement à plusieurs pharmacies
 * n'est pas décidé.
 */
export interface PharmacistAuthService {
  readonly pharmacien: Signal<Utilisateur | null>;
  /** Vrai seulement pour un compte vérifié, rattaché à sa pharmacie (R3). */
  readonly peutDeclarer: Signal<boolean>;
  creerCompte(email: string, motDePasse: string): Observable<Utilisateur>;
}

export const PHARMACIST_AUTH_SERVICE = new InjectionToken<PharmacistAuthService>(
  'PHARMACIST_AUTH_SERVICE',
);
