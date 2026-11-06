import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Pharmacie } from '../../core/models';
import { lienItineraire, lienTelephone } from '../../core/outils/pharmacie.outils';
import { Bouton } from '../bouton/bouton';

/** Appeler et Itinéraire, identiques sur la feuille et sur la page de la pharmacie. */
@Component({
  selector: 'app-actions-pharmacie',
  imports: [Bouton, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pharmacie().telephone) {
      <a
        appBouton
        icone="telephone"
        [href]="appel()"
        [attr.aria-label]="'fiche.appelerNom' | transloco: { nom: pharmacie().nom }"
      >
        {{ 'fiche.appeler' | transloco }}
      </a>
    } @else {
      <button type="button" appBouton icone="telephone" [desactive]="true">
        {{ 'fiche.pasDeTelephone' | transloco }}
      </button>
    }
    <a
      appBouton
      variante="secondaire"
      icone="itineraire"
      target="_blank"
      rel="noopener"
      [href]="itineraire()"
      [attr.aria-label]="'fiche.itineraireNom' | transloco: { nom: pharmacie().nom }"
    >
      {{ 'fiche.itineraire' | transloco }}
    </a>
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--e-3);
    }

    a,
    button {
      padding-inline: var(--e-2);
    }
  `,
})
export class ActionsPharmacie {
  readonly pharmacie = input.required<Pharmacie>();

  protected readonly appel = computed(() => lienTelephone(this.pharmacie().telephone));
  protected readonly itineraire = computed(() => lienItineraire(this.pharmacie()));
}
