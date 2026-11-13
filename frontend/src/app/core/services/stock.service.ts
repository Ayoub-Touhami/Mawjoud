import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { StatutDeclare, Stock } from '../models';
import { Coordonnees } from '../outils/pharmacie.outils';

export type ErreurStock = 'non-autorise' | 'reseau';

/**
 * Seule source des stocks, pour le public comme pour le pharmacien. Seul le dernier statut et
 * son heure sont gardés : aucun historique. Déclarer exige un compte vérifié, sur sa propre
 * pharmacie (R3, R9), sinon l'erreur est « non-autorise ».
 */
export interface StockService {
  stocksDePharmacie(pharmacieId: string): Observable<Stock[]>;
  /** Avec la position du visiteur (jamais gardée) : les pharmacies les plus proches d'abord. */
  stocksDeMedicament(medicamentId: string, position?: Coordonnees | null): Observable<Stock[]>;

  /** Médicaments suivis par la pharmacie, déclarés ou non. */
  medicamentsSuivis(pharmacieId: string): Observable<string[]>;
  suivreMedicament(pharmacieId: string, medicamentId: string): Observable<void>;
  /** Le médicament quitte aussi l'affichage public de cette pharmacie. */
  retirerMedicament(pharmacieId: string, medicamentId: string): Observable<void>;

  /** Remplace le statut précédent et renouvelle l'heure, même si le statut ne change pas. */
  declarer(pharmacieId: string, medicamentId: string, statut: StatutDeclare): Observable<Stock>;
  /** « Tout est à jour » : renouvelle l'heure de chaque déclaration, sans changer les statuts. */
  confirmerTout(pharmacieId: string): Observable<Stock[]>;
}

export const STOCK_SERVICE = new InjectionToken<StockService>('STOCK_SERVICE');

/**
 * Point d'extension appelé après chaque déclaration. Le back-end y branchera l'envoi réel des
 * e-mails d'alerte (F11).
 */
export interface EvaluateurAlertes {
  evaluer(stock: Stock): void;
}

export const EVALUATEUR_ALERTES = new InjectionToken<EvaluateurAlertes>('EVALUATEUR_ALERTES');
