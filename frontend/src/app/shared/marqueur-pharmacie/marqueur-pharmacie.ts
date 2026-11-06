import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { COCHE_MARQUEUR, CONTOUR_MARQUEUR, QUESTION_MARQUEUR } from './marqueur-formes';

/** Marqueur de pharmacie, distingué par la couleur, le contour et le signe (R8). */
@Component({
  selector: 'app-marqueur-pharmacie',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './marqueur-pharmacie.html',
  styleUrl: './marqueur-pharmacie.scss',
  host: { '[class.selectionne]': 'selectionne()' },
})
export class MarqueurPharmacie {
  readonly inscrite = input.required<boolean>();
  readonly selectionne = input(false);

  protected readonly contour = CONTOUR_MARQUEUR;
  protected readonly coche = COCHE_MARQUEUR;
  protected readonly question = QUESTION_MARQUEUR;
}
