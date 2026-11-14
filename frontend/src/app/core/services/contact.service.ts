import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';

export const SUJETS_CONTACT = ['question', 'erreur-pharmacie', 'pharmacien', 'autre'] as const;
export type SujetContact = (typeof SUJETS_CONTACT)[number];

export interface MessageContact {
  /** Facultatif. */
  nom?: string;
  email: string;
  sujet: SujetContact;
  message: string;
  /** Pharmacie concernée, quand le message part de sa fiche. */
  pharmacieId?: string;
}

export type ErreurContact = 'reseau' | 'donnees-invalides' | 'trop-de-tentatives' | 'indisponible';

/** Envoi d'un message de contact. L'erreur est « reseau » si l'envoi échoue. */
export interface ContactService {
  envoyer(message: MessageContact): Observable<void>;
}

export const CONTACT_SERVICE = new InjectionToken<ContactService>('CONTACT_SERVICE');
