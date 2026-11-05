import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Marqueur de pharmacie, distingué par la couleur, le contour et le signe (R8).
 * Composant seul : il sera posé sur la carte à la partie suivante.
 */
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
}
