import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StockServiceSimule } from '../../core/simulation/stock.service.simule';
import { environment } from '../../../environments/environment';

const HEURES_VIEILLISSEMENT = 25;

/** Développement uniquement : le passage du temps et une coupure réseau, à la demande. */
@Component({
  selector: 'app-outils-stock',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (actif) {
      <aside>
        <p>{{ 'pharmacien.outils.stock' | transloco }}</p>
        <button type="button" (click)="vieillir()">
          {{ 'pharmacien.outils.vieillir' | transloco }}
        </button>
        <label>
          <input type="checkbox" [checked]="panne()" (change)="basculerPanne()" />
          {{ 'pharmacien.outils.panne' | transloco }}
        </label>
      </aside>
    }
  `,
  styles: `
    aside {
      display: grid;
      gap: var(--e-1);
      justify-items: start;
      padding: var(--e-3) var(--e-4);
      border: 2px dashed var(--statut-tirets);
      border-radius: var(--rayon);
    }

    p {
      margin-block: 0;
      font-size: 14px;
      color: var(--texte-secondaire);
    }

    button,
    label {
      display: inline-flex;
      gap: var(--e-2);
      align-items: center;
      min-block-size: var(--cible-tactile);
      padding: 0;
      font: inherit;
      color: var(--lien);
      cursor: pointer;
      background: none;
      border: 0;
    }

    button {
      text-decoration: underline;
    }
  `,
})
export class OutilsStock {
  readonly pharmacieId = input.required<string>();
  readonly change = output<void>();

  private readonly stocks = inject(StockServiceSimule);
  protected readonly actif = environment.outilsSimulation;
  protected readonly panne = signal(false);

  protected vieillir(): void {
    this.stocks.vieillir(this.pharmacieId(), HEURES_VIEILLISSEMENT);
    this.change.emit();
  }

  protected basculerPanne(): void {
    this.panne.update((valeur) => !valeur);
    this.stocks.simulerPanne(this.panne());
  }
}
