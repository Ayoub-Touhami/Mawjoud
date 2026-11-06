import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { Alerte } from '../models';
import { AlertService, CreationAlerte, ErreurAlerte } from '../services/alert.service';
import { SessionService } from '../services/session.service';
import { StockageSimulation } from './stockage-simulation';

const refus = (erreur: ErreurAlerte) => throwError(() => erreur);

/** SIMULATION : les alertes sont enregistrées, mais aucun e-mail ne part jamais. */
@Injectable({ providedIn: 'root' })
export class AlertServiceSimule implements AlertService {
  private readonly stockage = inject(StockageSimulation);
  private readonly session = inject(SessionService);

  listerAlertes(): Observable<Alerte[]> {
    const id = this.session.utilisateur()?.id;
    return id ? of(this.stockage.alertes.filter((a) => a.utilisateurId === id)) : refus('non-connecte');
  }

  creerAlerte(medicamentId: string, ville: string | null): Observable<CreationAlerte> {
    const utilisateurId = this.session.utilisateur()?.id;
    if (!utilisateurId) {
      return refus('non-connecte');
    }
    const existante = this.trouverActive(utilisateurId, medicamentId, ville);
    if (existante) {
      return of({ alerte: existante, existante: true });
    }
    const alerte: Alerte = {
      id: crypto.randomUUID(),
      utilisateurId,
      medicamentId,
      ville,
      etat: 'active',
    };
    this.stockage.enregistrer({ alertes: [...this.stockage.alertes, alerte] });
    return of({ alerte, existante: false });
  }

  modifierAlerte(id: string, ville: string | null): Observable<Alerte> {
    const alerte = this.alerteDuCompte(id);
    if (!alerte) {
      return refus('introuvable');
    }
    const autre = this.trouverActive(alerte.utilisateurId, alerte.medicamentId, ville);
    if (autre && autre.id !== id) {
      return refus('doublon');
    }
    const modifiee = { ...alerte, ville };
    this.stockage.enregistrer({
      alertes: this.stockage.alertes.map((a) => (a.id === id ? modifiee : a)),
    });
    return of(modifiee);
  }

  supprimerAlerte(id: string): Observable<void> {
    if (!this.alerteDuCompte(id)) {
      return refus('introuvable');
    }
    this.stockage.enregistrer({ alertes: this.stockage.alertes.filter((a) => a.id !== id) });
    return of(undefined);
  }

  desabonner(jeton: string): Observable<void> {
    const compte = this.stockage.comptes.find((c) => c.jetonDesabonnement === jeton);
    if (!compte) {
      return refus('lien-invalide');
    }
    this.stockage.enregistrer({
      alertes: this.stockage.alertes.map((a) =>
        a.utilisateurId === compte.id ? { ...a, etat: 'terminee' } : a,
      ),
    });
    return of(undefined);
  }

  /** Pour l'aperçu de l'e-mail : le jeton du compte connecté. */
  jetonDesabonnement(): string | null {
    const id = this.session.utilisateur()?.id;
    return this.stockage.comptes.find((c) => c.id === id)?.jetonDesabonnement ?? null;
  }

  private alerteDuCompte(id: string): Alerte | undefined {
    const utilisateurId = this.session.utilisateur()?.id;
    return this.stockage.alertes.find((a) => a.id === id && a.utilisateurId === utilisateurId);
  }

  private trouverActive(
    utilisateurId: string,
    medicamentId: string,
    ville: string | null,
  ): Alerte | undefined {
    return this.stockage.alertes.find(
      (a) =>
        a.utilisateurId === utilisateurId &&
        a.medicamentId === medicamentId &&
        a.ville === ville &&
        a.etat === 'active',
    );
  }
}
