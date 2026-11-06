import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MEDICAMENTS_TEST } from '../donnees-test/medicaments';
import { PHARMACIES_TEST } from '../donnees-test/pharmacies';
import { Medicament, Pharmacie } from '../models';
import { chercherDans } from '../outils/recherche.outils';
import { StockageSimulation } from '../simulation/stockage-simulation';
import { PharmacieApi } from './pharmacie-api';

/** Simulation de l'annuaire et de la liste des médicaments, à partir des données de test. */
@Injectable()
export class PharmacieApiMock implements PharmacieApi {
  private readonly stockage = inject(StockageSimulation);

  listerPharmacies(ville?: string): Observable<Pharmacie[]> {
    return of(this.pharmacies().filter((p) => !ville || p.ville === ville));
  }

  obtenirPharmacie(id: string): Observable<Pharmacie | undefined> {
    return of(this.pharmacies().find((p) => p.id === id));
  }

  listerVilles(): Observable<string[]> {
    return of([...new Set(this.pharmacies().map((p) => p.ville))].sort((a, b) => a.localeCompare(b)));
  }

  listerMedicaments(): Observable<Medicament[]> {
    return of(MEDICAMENTS_TEST);
  }

  obtenirMedicament(id: string): Observable<Medicament | undefined> {
    return of(MEDICAMENTS_TEST.find((m) => m.id === id));
  }

  chercherMedicaments(texte: string): Observable<Medicament[]> {
    return of(chercherDans(MEDICAMENTS_TEST, texte));
  }

  medicamentsProches(texte: string): Observable<Medicament[]> {
    return of(chercherDans(MEDICAMENTS_TEST, texte, true));
  }

  /** L'état suit les réclamations : « inscrite » seulement après validation (F8). */
  private pharmacies(): Pharmacie[] {
    const demandes = this.stockage.demandes;
    return PHARMACIES_TEST.map((pharmacie) => {
      const liees = demandes.filter((d) => d.pharmacieId === pharmacie.id);
      if (liees.some((d) => d.etat === 'validee')) {
        return { ...pharmacie, etat: 'inscrite' };
      }
      return liees.some((d) => d.etat === 'en-attente' && !d.conflit)
        ? { ...pharmacie, etat: 'reclamee' }
        : pharmacie;
    });
  }
}
