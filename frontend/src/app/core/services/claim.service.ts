import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { DemandeReclamation, Justificatif, Pharmacie, PharmacieProposee } from '../models';

export type ErreurReclamation = 'non-connecte' | 'demande-en-cours' | 'introuvable';

/** Réclamation d'une pharmacie (F5). La méthode de vérification n'est pas décidée. */
export interface ClaimService {
  /** Recherche dans l'annuaire, par nom, ville ou adresse. */
  chercherPharmacies(texte: string): Observable<Pharmacie[]>;
  /** Dernière demande du pharmacien connecté. */
  maDemande(): Observable<DemandeReclamation | null>;
  /** Si la pharmacie est déjà réclamée, la demande part à l'administrateur (`conflit`). */
  reclamer(pharmacieId: string, justificatif: Justificatif): Observable<DemandeReclamation>;
  /** Pharmacie absente de l'annuaire : demande d'ajout à l'administrateur. */
  demanderAjout(
    pharmacie: PharmacieProposee,
    justificatif: Justificatif,
  ): Observable<DemandeReclamation>;
}

export const CLAIM_SERVICE = new InjectionToken<ClaimService>('CLAIM_SERVICE');
