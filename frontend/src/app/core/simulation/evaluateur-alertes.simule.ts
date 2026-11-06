import { inject, Injectable } from '@angular/core';
import { PHARMACIES_TEST } from '../donnees-test/pharmacies';
import { Stock } from '../models';
import { HORLOGE } from '../services/horloge';
import { EvaluateurAlertes } from '../services/stock.service';
import { StockageSimulation } from './stockage-simulation';

/**
 * SIMULATION : marque les alertes qui seraient déclenchées, sans envoyer d'e-mail. Seul
 * « Disponible » déclenche, et jamais pour une adresse non vérifiée.
 */
@Injectable({ providedIn: 'root' })
export class EvaluateurAlertesSimule implements EvaluateurAlertes {
  private readonly stockage = inject(StockageSimulation);
  private readonly horloge = inject(HORLOGE);

  evaluer(stock: Stock): void {
    const gouvernorat = PHARMACIES_TEST.find((p) => p.id === stock.pharmacieId)?.gouvernorat;
    if (stock.statutDeclare !== 'disponible' || !gouvernorat) {
      return;
    }
    const verifies = new Set(this.stockage.comptes.filter((c) => c.emailVerifie).map((c) => c.id));
    this.stockage.enregistrer({
      alertes: this.stockage.alertes.map((alerte) =>
        alerte.etat === 'active' &&
        alerte.medicamentId === stock.medicamentId &&
        (alerte.ville === null || alerte.ville === gouvernorat) &&
        verifies.has(alerte.utilisateurId)
          ? { ...alerte, etat: 'terminee', declencheeLe: this.horloge().toISOString() }
          : alerte,
      ),
    });
  }
}
