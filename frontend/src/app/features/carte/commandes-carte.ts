import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icone } from '../../shared/icone/icone';

/** « Ma position » et le zoom : nos boutons, pas ceux de la bibliothèque de carte. */
@Component({
  selector: 'app-commandes-carte',
  imports: [Icone, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="seul"
      [attr.aria-label]="'carte.commandes.maPosition' | transloco"
      [attr.aria-busy]="recherche() ? 'true' : null"
      (click)="position.emit()"
    >
      <app-icone nom="ma-position" />
    </button>
    <div class="zoom">
      <button
        type="button"
        [attr.aria-label]="'carte.commandes.zoomer' | transloco"
        (click)="zoom.emit(1)"
      >
        <app-icone nom="plus" />
      </button>
      <button
        type="button"
        [attr.aria-label]="'carte.commandes.dezoomer' | transloco"
        (click)="zoom.emit(-1)"
      >
        <app-icone nom="moins" />
      </button>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--e-2);
    }

    button {
      display: grid;
      place-items: center;
      inline-size: 44px;
      block-size: 44px;
      padding: 0;
      color: var(--titre);
      cursor: pointer;
      background: var(--carte);
      border: 0;
    }

    button:hover {
      background: var(--contour-survol);
    }

    button[aria-busy] {
      color: var(--texte-secondaire);
    }

    .seul,
    .zoom {
      overflow: hidden;
      border: 1px solid var(--carte-bord);
      border-radius: var(--rayon);
      box-shadow: var(--ombre-carte);
    }

    .zoom button + button {
      border-block-start: 1px solid var(--carte-bord);
    }
  `,
})
export class CommandesCarte {
  readonly recherche = input(false);
  readonly position = output<void>();
  readonly zoom = output<number>();
}
