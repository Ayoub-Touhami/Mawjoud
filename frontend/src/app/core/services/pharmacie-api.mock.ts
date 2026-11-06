import { inject, Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { MEDICAMENTS_TEST } from '../donnees-test/medicaments';
import { Medicament, Pharmacie } from '../models';
import { chercherDans } from '../outils/recherche.outils';
import { AnnuaireSimule } from '../simulation/annuaire-simule';
import { PharmacieApi } from './pharmacie-api';

/** Simulation de l'annuaire et de la liste des médicaments, à partir des données de test. */
@Injectable()
export class PharmacieApiMock implements PharmacieApi {
  private readonly annuaire = inject(AnnuaireSimule);

  listerPharmacies(ville?: string): Observable<Pharmacie[]> {
    return of(this.annuaire.publiques().filter((p) => !ville || p.ville === ville));
  }

  obtenirPharmacie(id: string): Observable<Pharmacie | undefined> {
    const pharmacie = this.annuaire.trouver(id);
    return of(pharmacie?.fermee ? undefined : pharmacie);
  }

  listerVilles(): Observable<string[]> {
    return of([...new Set(this.annuaire.publiques().map((p) => p.ville))].sort((a, b) => a.localeCompare(b)));
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
}
