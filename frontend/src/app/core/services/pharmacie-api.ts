import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Medicament, Pharmacie } from '../models';

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
  obtenirMedicament(id: string): Observable<Medicament | undefined>;
  /** Ignore accents et majuscules, tolère les petites fautes, par nom ou par substance. */
  chercherMedicaments(texte: string): Observable<Medicament[]>;
  /** Noms plus éloignés, à proposer quand la recherche ne trouve rien. */
  medicamentsProches(texte: string): Observable<Medicament[]>;
}

export const PHARMACIE_API = new InjectionToken<PharmacieApi>('PHARMACIE_API');
