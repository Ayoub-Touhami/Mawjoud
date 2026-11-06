import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { environment } from '../../environments/environment';

/** Visible sur toutes les pages tant que environment.donneesSimulees vaut true. */
@Component({
  selector: 'app-bandeau-donnees-test',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (actif) {
      <p>{{ 'app.donneesTest' | transloco }}</p>
    }
  `,
  styles: `
    p {
      padding: 2px var(--e-3);
      margin-block: 0;
      font-size: 12px;
      font-weight: 600;
      color: var(--texte);
      text-align: center;
      background: var(--statut-limitee-fond);
    }
  `,
})
export class BandeauDonneesTest {
  protected readonly actif = environment.donneesSimulees;
}
