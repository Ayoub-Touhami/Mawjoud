import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, map, of } from 'rxjs';
import { Medicament, StatutDeclare, Stock } from '../../core/models';
import { libelleMedicament } from '../../core/outils/recherche.outils';
import { FraicheurService } from '../../core/services/fraicheur.service';
import { PHARMACIE_API } from '../../core/services/pharmacie-api';
import { PHARMACIST_AUTH_SERVICE } from '../../core/services/pharmacist-auth.service';
import { STOCK_SERVICE } from '../../core/services/stock.service';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { RechercheMedicament } from '../../shared/recherche-medicament/recherche-medicament';
import { LigneStock } from './ligne-stock';
import { OutilsStock } from './outils-stock';

@Component({
  selector: 'app-espace-pharmacien-page',
  imports: [Bouton, Icone, LigneStock, OutilsStock, RechercheMedicament, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './espace-pharmacien.page.html',
  styleUrl: './espace-pharmacien.page.scss',
})
export class EspacePharmacienPage {
  private readonly pharmaciens = inject(PHARMACIST_AUTH_SERVICE);
  private readonly stocksService = inject(STOCK_SERVICE);
  private readonly api = inject(PHARMACIE_API);
  private readonly fraicheur = inject(FraicheurService);

  protected readonly pharmacieId = this.pharmaciens.pharmacien()?.pharmacieId ?? '';
  protected readonly peutDeclarer = this.pharmaciens.peutDeclarer;
  protected readonly pharmacie = toSignal(
    this.pharmacieId ? this.api.obtenirPharmacie(this.pharmacieId) : of(undefined),
  );
  private readonly medicaments = toSignal(
    this.api.listerMedicaments().pipe(map((liste) => new Map(liste.map((m) => [m.id, m])))),
  );
  private readonly suivis = signal<string[]>([]);
  private readonly stocks = signal<Stock[]>([]);
  /** Statuts non enregistrés, par médicament : aucun appui n'est perdu en silence. */
  private readonly echecs = signal<ReadonlyMap<string, StatutDeclare>>(new Map());

  protected readonly enCours = signal<string | null>(null);
  protected readonly ajout = signal(false);
  protected readonly confirmation = signal(false);
  protected readonly echecGlobal = signal(false);

  protected readonly lignes = computed(() => {
    const stocks = new Map(this.stocks().map((s) => [s.medicamentId, s]));
    // Triées par nom : une ligne ne doit pas bouger sous le doigt après un appui.
    return this.suivis()
      .map((id) => {
        const stock = stocks.get(id);
        const medicament = this.medicaments()?.get(id);
        return {
          id,
          nom: medicament ? libelleMedicament(medicament) : id,
          lecture: stock ? this.fraicheur.lire(stock) : null,
          echec: this.echecs().get(id) ?? null,
        };
      })
      .sort((a, b) => a.nom.localeCompare(b.nom, undefined, { numeric: true }));
  });
  protected readonly declares = computed(() => this.stocks().length);

  constructor() {
    void this.charger();
  }

  protected async declarer(medicamentId: string, statut: StatutDeclare): Promise<void> {
    this.enCours.set(medicamentId);
    try {
      await firstValueFrom(this.stocksService.declarer(this.pharmacieId, medicamentId, statut));
      this.oublierEchec(medicamentId);
      await this.charger();
    } catch {
      this.echecs.update((echecs) => new Map(echecs).set(medicamentId, statut));
    } finally {
      this.enCours.set(null);
    }
  }

  protected async ajouter(medicament: Medicament | null): Promise<void> {
    if (!medicament) {
      return;
    }
    try {
      await firstValueFrom(this.stocksService.suivreMedicament(this.pharmacieId, medicament.id));
      this.ajout.set(false);
      this.echecGlobal.set(false);
      await this.charger();
    } catch {
      this.echecGlobal.set(true);
    }
  }

  protected async retirer(medicamentId: string): Promise<void> {
    try {
      await firstValueFrom(this.stocksService.retirerMedicament(this.pharmacieId, medicamentId));
      this.oublierEchec(medicamentId);
      this.echecGlobal.set(false);
      await this.charger();
    } catch {
      this.echecGlobal.set(true);
    }
  }

  protected async toutConfirmer(): Promise<void> {
    try {
      await firstValueFrom(this.stocksService.confirmerTout(this.pharmacieId));
      this.confirmation.set(false);
      this.echecGlobal.set(false);
      await this.charger();
    } catch {
      this.echecGlobal.set(true);
    }
  }

  protected async charger(): Promise<void> {
    this.suivis.set(await firstValueFrom(this.stocksService.medicamentsSuivis(this.pharmacieId)));
    this.stocks.set(await firstValueFrom(this.stocksService.stocksDePharmacie(this.pharmacieId)));
  }

  private oublierEchec(medicamentId: string): void {
    this.echecs.update((echecs) => {
      const suite = new Map(echecs);
      suite.delete(medicamentId);
      return suite;
    });
  }
}
