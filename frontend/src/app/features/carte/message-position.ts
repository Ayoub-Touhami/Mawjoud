import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { DemandePosition } from './demande-position';

@Component({
  selector: 'app-message-position',
  imports: [Bouton, Icone, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (demande.message(); as type) {
      <div class="message" role="status">
        @if (type === 'pourquoi') {
          <p>{{ 'carte.position.pourquoi' | transloco }}</p>
          <div class="choix">
            <button type="button" appBouton (click)="demande.accepter()">
              {{ 'carte.position.continuer' | transloco }}
            </button>
            <button
              type="button"
              appBouton
              variante="secondaire"
              (click)="demande.message.set(null)"
            >
              {{ 'carte.position.annuler' | transloco }}
            </button>
          </div>
        } @else {
          <p>{{ 'carte.position.' + type | transloco }}</p>
          <button
            type="button"
            class="fermer"
            [attr.aria-label]="'carte.position.fermer' | transloco"
            (click)="demande.message.set(null)"
          >
            <app-icone nom="fermer" />
          </button>
        }
      </div>
    }
  `,
  styles: `
    .message {
      position: relative;
      display: grid;
      gap: var(--e-3);
      padding: var(--e-3) var(--e-4);
      background: var(--carte);
      border: 1px solid var(--carte-bord);
      border-radius: var(--rayon);
      box-shadow: var(--ombre-haute);
    }

    p {
      margin-block: 0;
    }

    .message:has(.fermer) p {
      padding-inline-end: var(--cible-tactile);
    }

    .choix {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--e-2);
    }

    .fermer {
      position: absolute;
      inset-block-start: 0;
      inset-inline-end: 0;
      display: grid;
      place-items: center;
      inline-size: var(--cible-tactile);
      block-size: var(--cible-tactile);
      color: var(--texte-secondaire);
      cursor: pointer;
      background: transparent;
      border: 0;
    }
  `,
})
export class MessagePositionCarte {
  protected readonly demande = inject(DemandePosition);
}
