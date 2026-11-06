import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NavigationService } from '../../core/services/navigation.service';
import { SelecteurLangue } from '../../layout/selecteur-langue/selecteur-langue';
import { Icone } from '../../shared/icone/icone';
import { RechercheMedicament } from '../../shared/recherche-medicament/recherche-medicament';

/** Barre du haut de la carte. Sur mobile, l'en-tête étant masqué, elle porte la langue et le menu. */
@Component({
  selector: 'app-barre-carte',
  imports: [Icone, RechercheMedicament, SelecteurLangue, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-recherche-medicament>
      <div class="mobile">
        <app-selecteur-langue />
        <button
          type="button"
          class="menu"
          aria-haspopup="true"
          [attr.aria-label]="'carte.commandes.menu' | transloco"
          (click)="navigation.menuOuvert.set(true)"
        >
          <app-icone nom="menu" />
        </button>
      </div>
    </app-recherche-medicament>
  `,
  styles: `
    .mobile {
      display: flex;
      flex-shrink: 0;
      gap: var(--e-1);
    }

    .menu {
      display: grid;
      place-items: center;
      inline-size: var(--cible-tactile);
      block-size: var(--cible-tactile);
      color: var(--titre);
      cursor: pointer;
      background: transparent;
      border: 0;
      border-radius: var(--rayon-petit);
    }

    @media (min-width: 860px) {
      .mobile {
        display: none;
      }
    }
  `,
})
export class BarreCarte {
  protected readonly navigation = inject(NavigationService);
}
