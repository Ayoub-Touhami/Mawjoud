import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Alerte,
  DemandeReclamation,
  Medicament,
  Pharmacie,
  StatutDeclare,
  Stock,
  Utilisateur,
} from '../models';

/**
 * Contrat entre les pages et les données. Les pages injectent PHARMACIE_API et ignorent
 * l'implémentation : remplacer la simulation par le back-end ne change qu'une ligne
 * dans app.config.ts.
 */
export interface PharmacieApi {
  listerPharmacies(ville?: string): Observable<Pharmacie[]>;
  obtenirPharmacie(id: string): Observable<Pharmacie | undefined>;
  listerVilles(): Observable<string[]>;

  listerMedicaments(): Observable<Medicament[]>;
  chercherMedicaments(texte: string): Observable<Medicament[]>;

  stocksDePharmacie(pharmacieId: string): Observable<Stock[]>;
  stocksDeMedicament(medicamentId: string, ville?: string): Observable<Stock[]>;
  /** Refusé si le compte n'est pas vérifié ou si la pharmacie n'est pas la sienne (R3, R9). */
  declarerStock(
    utilisateurId: string,
    pharmacieId: string,
    medicamentId: string,
    statut: StatutDeclare,
  ): Observable<Stock>;

  seConnecter(email: string, motDePasse: string): Observable<Utilisateur | null>;

  listerAlertes(utilisateurId: string): Observable<Alerte[]>;
  /** Renvoie l'alerte existante plutôt qu'un doublon (F10). */
  creerAlerte(
    utilisateurId: string,
    medicamentId: string,
    ville: string | null,
  ): Observable<Alerte>;
  modifierAlerte(id: string, ville: string | null): Observable<Alerte>;
  supprimerAlerte(id: string): Observable<void>;

  listerDemandes(): Observable<DemandeReclamation[]>;
  creerDemande(pharmacienId: string, pharmacieId: string): Observable<DemandeReclamation>;
  validerDemande(id: string): Observable<DemandeReclamation>;
  refuserDemande(id: string, motif: string): Observable<DemandeReclamation>;
}

export const PHARMACIE_API = new InjectionToken<PharmacieApi>('PHARMACIE_API');
