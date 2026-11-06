import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Icone } from '../../shared/icone/icone';

const ETAPES = ['compte', 'pharmacie', 'verification'];

/** Les trois étapes de la maquette : faite (coche), en cours (cerclée), à venir (pointillés). */
@Component({
  selector: 'app-etapes-pharmacien',
  imports: [Icone, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol>
      @for (etape of etapes; track etape; let i = $index) {
        <li
          [class.faite]="i + 1 < active()"
          [class.active]="i + 1 === active()"
          [attr.aria-current]="i + 1 === active() ? 'step' : null"
        >
          <span class="rond">
            @if (i + 1 < active()) {
              <app-icone nom="coche" [taille]="18" />
            } @else {
              {{ i + 1 }}
            }
          </span>
          <span class="nom">{{ 'pharmacien.etapes.' + etape | transloco }}</span>
        </li>
      }
    </ol>
  `,
  styles: `
    ol {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      padding: 0;
      margin: 0;
      list-style: none;
    }

    li {
      position: relative;
      display: grid;
      gap: var(--e-1);
      justify-items: center;
      font-size: 14px;
      font-weight: 600;
      color: var(--texte-secondaire);
      text-align: center;
    }

    li + li::before {
      position: absolute;
      inset-block-start: 15px;
      inset-inline: -50% 50%;
      content: '';
      border-block-start: 2px solid var(--carte-bord);
    }

    li.active + li::before {
      border-block-start-color: var(--carte-bord);
    }

    li.faite,
    li.active {
      color: var(--titre);
    }

    li.faite + li::before {
      border-block-start-color: var(--contour);
    }

    .rond {
      position: relative;
      display: grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      background: var(--fond);
      border: 2px dashed var(--statut-tirets);
      border-radius: 50%;
    }

    .active .rond {
      border: 2px solid var(--contour);
    }

    .faite .rond {
      color: var(--action-texte);
      background: var(--action);
      border: 2px solid var(--action);
    }
  `,
})
export class EtapesPharmacien {
  readonly active = input.required<number>();

  protected readonly etapes = ETAPES;
}
