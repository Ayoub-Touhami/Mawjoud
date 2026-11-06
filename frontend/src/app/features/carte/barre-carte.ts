import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NavigationService } from '../../core/services/navigation.service';
import { SelecteurLangue } from '../../layout/selecteur-langue/selecteur-langue';
import { Icone } from '../../shared/icone/icone';

/**
 * Barre du haut de la carte. Le champ est en place, mais il ne lance aucune recherche pour
 * l'instant. Sur mobile, l'en-tête étant masqué, elle porte aussi la langue et le menu.
 */
@Component({
  selector: 'app-barre-carte',
  imports: [Icone, SelecteurLangue, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form role="search" (submit)="$event.preventDefault()">
      <app-icone nom="loupe" [taille]="24" />
      <label class="visuellement-masque" for="recherche-medicament">
        {{ 'carte.recherche.libelle' | transloco }}
      </label>
      <input
        id="recherche-medicament"
        type="search"
        autocomplete="off"
        [placeholder]="'carte.recherche.placeholder' | transloco"
      />
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
    </form>
  `,
  styles: `
    form {
      display: flex;
      align-items: center;
      gap: var(--e-2);
      min-block-size: 52px;
      padding-block: var(--e-1);
      padding-inline: var(--e-4) var(--e-1);
      color: var(--titre);
      background: var(--carte);
      border: 1px solid var(--carte-bord);
      border-radius: var(--rayon);
      box-shadow: var(--ombre-haute);
    }

    form:focus-within {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }

    input {
      flex: 1;
      min-inline-size: 0;
      min-block-size: var(--cible-tactile);
      padding: 0;
      font: inherit;
      font-size: 16px;
      color: var(--texte);
      background: transparent;
      border: 0;
      outline: none;
    }

    input::placeholder {
      color: var(--texte-secondaire);
      opacity: 1;
    }

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

      form {
        padding-inline-end: var(--e-4);
      }
    }
  `,
})
export class BarreCarte {
  protected readonly navigation = inject(NavigationService);
}
