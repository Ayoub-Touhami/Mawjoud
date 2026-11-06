import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MarqueurPharmacie } from '../../shared/marqueur-pharmacie/marqueur-pharmacie';

/** Le texte dit déjà le statut : les marqueurs sont masqués aux lecteurs d'écran. */
@Component({
  selector: 'app-legende-carte',
  imports: [MarqueurPharmacie, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl [attr.aria-label]="'carte.commandes.legende' | transloco">
      <div>
        <dt aria-hidden="true"><app-marqueur-pharmacie [inscrite]="true" /></dt>
        <dd>{{ 'marqueur.inscrite' | transloco }}</dd>
      </div>
      <div>
        <dt aria-hidden="true"><app-marqueur-pharmacie [inscrite]="false" /></dt>
        <dd>{{ 'marqueur.nonInscrite' | transloco }}</dd>
      </div>
    </dl>
  `,
  styles: `
    dl {
      display: grid;
      gap: var(--e-2);
      inline-size: fit-content;
      padding-block: var(--e-2);
      padding-inline: var(--e-3) var(--e-4);
      margin: 0;
      font-size: 14px;
      font-weight: 500;
      color: var(--texte);
      background: var(--carte);
      border: 1px solid var(--carte-bord);
      border-radius: var(--rayon);
      box-shadow: var(--ombre-carte);
    }

    div {
      display: flex;
      align-items: center;
      gap: var(--e-2);
    }

    dd {
      margin: 0;
    }

    dt {
      display: flex;
    }

    app-marqueur-pharmacie {
      inline-size: 18px;
      block-size: 23px;
    }
  `,
})
export class LegendeCarte {}
