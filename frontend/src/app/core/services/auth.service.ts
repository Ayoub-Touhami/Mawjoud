import { InjectionToken, Signal } from '@angular/core';
import { Observable } from 'rxjs';
import { Utilisateur } from '../models';

/** Raison d'un refus. Les écrans la traduisent : aucun texte ne vient du service. */
export type ErreurAuth =
  | 'email-utilise'
  | 'identifiants'
  | 'lien-expire'
  | 'lien-invalide'
  | 'non-connecte'
  | 'mot-de-passe-court'
  | 'mot-de-passe-courant'
  | 'mot-de-passe-email'
  | 'email-non-verifie'
  | 'compte-suspendu'
  | 'trop-de-tentatives'
  | 'reseau'
  | 'indisponible';

/**
 * Contrat entre les écrans et les comptes. Les erreurs sont renvoyées sous la forme d'une
 * ErreurAuth. Brancher le back-end ne change que la ligne AUTH_SERVICE de app.config.ts.
 */
export interface AuthService {
  readonly utilisateur: Signal<Utilisateur | null>;

  creerCompte(email: string, motDePasse: string): Observable<Utilisateur>;
  seConnecter(email: string, motDePasse: string): Observable<Utilisateur>;
  seDeconnecter(): void;

  /** Valide le lien reçu par e-mail. */
  verifierEmail(jeton: string): Observable<void>;
  /** Renvoie le lien au compte connecté, ou à celui d'un lien expiré. */
  renvoyerLien(jetonExpire?: string): Observable<void>;

  /** Définitif : le compte et ses alertes disparaissent. */
  supprimerCompte(): Observable<void>;
}

export const AUTH_SERVICE = new InjectionToken<AuthService>('AUTH_SERVICE');
