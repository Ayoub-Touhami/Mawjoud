import { inject, Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { fabriquerStocks } from '../donnees-test/stocks';
import { StatutDeclare, Stock } from '../models';
import { HORLOGE } from '../services/horloge';
import { SessionService } from '../services/session.service';
import { ErreurStock, EVALUATEUR_ALERTES, StockService } from '../services/stock.service';
import { AnnuaireSimule } from './annuaire-simule';
import { StockageSimulation } from './stockage-simulation';

const refus = (erreur: ErreurStock) => throwError(() => erreur);
const cle = (pharmacieId: string, medicamentId: string) => `${pharmacieId}|${medicamentId}`;
const HEURE_MS = 60 * 60 * 1000;

/**
 * SIMULATION : les stocks de test fabriqués, recouverts par ce que les pharmaciens déclarent.
 * Une déclaration remplace la précédente : aucun historique n'est gardé.
 */
@Injectable({ providedIn: 'root' })
export class StockServiceSimule implements StockService {
  private readonly stockage = inject(StockageSimulation);
  private readonly session = inject(SessionService);
  private readonly annuaire = inject(AnnuaireSimule);
  private readonly horloge = inject(HORLOGE);
  private readonly evaluateur = inject(EVALUATEUR_ALERTES);
  private readonly fabriques = fabriquerStocks(this.horloge());
  private panneSimulee = false;

  stocksDePharmacie(pharmacieId: string): Observable<Stock[]> {
    const id = this.annuaire.resoudre(pharmacieId);
    return of(this.tous().filter((s) => s.pharmacieId === id && this.lisible(id)));
  }

  stocksDeMedicament(medicamentId: string): Observable<Stock[]> {
    return of(
      this.tous().filter(
        (s) => s.medicamentId === medicamentId && this.annuaire.stocksVisibles(s.pharmacieId),
      ),
    );
  }

  medicamentsSuivis(pharmacieId: string): Observable<string[]> {
    const declares = this.tous()
      .filter((s) => s.pharmacieId === pharmacieId)
      .map((s) => s.medicamentId);
    const ajoutes = this.stockage.suivis
      .filter((c) => c.startsWith(`${pharmacieId}|`))
      .map((c) => c.split('|')[1]);
    return of([...new Set([...declares, ...ajoutes])]);
  }

  suivreMedicament(pharmacieId: string, medicamentId: string): Observable<void> {
    const erreur = this.controler(pharmacieId);
    if (erreur) {
      return refus(erreur);
    }
    const suivi = cle(pharmacieId, medicamentId);
    this.stockage.enregistrer({
      suivis: [...this.stockage.suivis.filter((c) => c !== suivi), suivi],
      stocksRetires: this.stockage.stocksRetires.filter((c) => c !== suivi),
    });
    return of(undefined);
  }

  retirerMedicament(pharmacieId: string, medicamentId: string): Observable<void> {
    const erreur = this.controler(pharmacieId);
    if (erreur) {
      return refus(erreur);
    }
    const suivi = cle(pharmacieId, medicamentId);
    this.stockage.enregistrer({
      suivis: this.stockage.suivis.filter((c) => c !== suivi),
      stocksRetires: [...this.stockage.stocksRetires, suivi],
      stocksDeclares: this.stockage.stocksDeclares.filter(
        (s) => cle(s.pharmacieId, s.medicamentId) !== suivi,
      ),
    });
    return of(undefined);
  }

  declarer(pharmacieId: string, medicamentId: string, statut: StatutDeclare): Observable<Stock> {
    const erreur = this.controler(pharmacieId);
    if (erreur) {
      return refus(erreur);
    }
    const stock: Stock = {
      pharmacieId,
      medicamentId,
      statutDeclare: statut,
      declareLe: this.horloge().toISOString(),
    };
    this.remplacer([stock]);
    this.evaluateur.evaluer(stock);
    return of(stock);
  }

  confirmerTout(pharmacieId: string): Observable<Stock[]> {
    const erreur = this.controler(pharmacieId);
    if (erreur) {
      return refus(erreur);
    }
    const declareLe = this.horloge().toISOString();
    const stocks = this.tous()
      .filter((s) => s.pharmacieId === pharmacieId)
      .map((s) => ({ ...s, declareLe }));
    this.remplacer(stocks);
    stocks.forEach((stock) => this.evaluateur.evaluer(stock));
    return of(stocks);
  }

  /** Simule une coupure réseau, pour les tests et le développement. */
  simulerPanne(active: boolean): void {
    this.panneSimulee = active;
  }

  /** Développement uniquement : fait vieillir les déclarations d'une pharmacie. */
  vieillir(pharmacieId: string, heures: number): void {
    this.remplacer(
      this.tous()
        .filter((s) => s.pharmacieId === pharmacieId)
        .map((s) => ({
          ...s,
          declareLe: new Date(new Date(s.declareLe).getTime() - heures * HEURE_MS).toISOString(),
        })),
    );
  }

  /** Le public ne voit que les pharmacies inscrites ; le pharmacien garde sa liste. */
  private lisible(pharmacieId: string): boolean {
    return (
      this.annuaire.stocksVisibles(pharmacieId) ||
      this.session.utilisateur()?.pharmacieId === pharmacieId
    );
  }

  private tous(): Stock[] {
    const declares = new Set(
      this.stockage.stocksDeclares.map((s) => cle(s.pharmacieId, s.medicamentId)),
    );
    const retires = new Set(this.stockage.stocksRetires);
    const sansStock = new Set(this.stockage.stocksFabriquesRetires);
    return [
      ...this.fabriques
        .map((s) => ({ ...s, pharmacieId: this.annuaire.resoudre(s.pharmacieId) }))
        .filter((s) => {
          const c = cle(s.pharmacieId, s.medicamentId);
          return !declares.has(c) && !retires.has(c) && !sansStock.has(s.pharmacieId);
        }),
      ...this.stockage.stocksDeclares,
    ];
  }

  private remplacer(stocks: Stock[]): void {
    const remplaces = new Set(stocks.map((s) => cle(s.pharmacieId, s.medicamentId)));
    this.stockage.enregistrer({
      stocksDeclares: [
        ...this.stockage.stocksDeclares.filter(
          (s) => !remplaces.has(cle(s.pharmacieId, s.medicamentId)),
        ),
        ...stocks,
      ],
      stocksRetires: this.stockage.stocksRetires.filter((c) => !remplaces.has(c)),
    });
  }

  /** Compte vérifié, sur sa propre pharmacie (R3, R9). La panne passe après ce contrôle. */
  private controler(pharmacieId: string): ErreurStock | null {
    const id = this.session.utilisateur()?.id;
    const compte = this.stockage.comptes.find((c) => c.id === id);
    if (!compte?.compteVerifie || compte.suspendu || compte.pharmacieId !== pharmacieId) {
      return 'non-autorise';
    }
    return this.panneSimulee || !navigator.onLine ? 'reseau' : null;
  }
}
