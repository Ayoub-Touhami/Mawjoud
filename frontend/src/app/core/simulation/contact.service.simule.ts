import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { ContactService, ErreurContact, MessageContact } from '../services/contact.service';
import { HORLOGE } from '../services/horloge';
import { StockageSimulation } from './stockage-simulation';

/** SIMULATION : le message reste dans le navigateur, personne ne le reçoit. */
@Injectable({ providedIn: 'root' })
export class ContactServiceSimule implements ContactService {
  private readonly stockage = inject(StockageSimulation);
  private readonly horloge = inject(HORLOGE);
  private panneSimulee = false;

  envoyer(message: MessageContact): Observable<void> {
    if (this.panneSimulee || !navigator.onLine) {
      return throwError(() => 'reseau' satisfies ErreurContact);
    }
    this.stockage.enregistrer({
      contacts: [
        ...this.stockage.contacts,
        { ...message, id: crypto.randomUUID(), date: this.horloge().toISOString() },
      ],
    });
    return of(undefined);
  }

  /** Simule une coupure réseau, pour les tests. */
  simulerPanne(active: boolean): void {
    this.panneSimulee = active;
  }
}
