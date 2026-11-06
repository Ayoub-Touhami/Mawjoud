import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';

/** Le médicament voyage dans l'adresse pour préremplir la page de création d'alerte. */
@Component({
  selector: 'app-bandeau-alerte',
  imports: [Bouton, Icone, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-icone nom="alerte" [taille]="28" />
    <p>{{ 'recherche.alerte.texte' | transloco }}</p>
    <a appBouton variante="alerte" routerLink="/alertes/creer" [queryParams]="parametres()">
      {{ 'recherche.alerte.action' | transloco }}
    </a>
  `,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--e-3);
      padding: var(--e-3) var(--e-4);
      color: var(--alerte-texte);
      background: var(--alerte);
      border-radius: var(--rayon);
    }

    p {
      flex: 1;
      min-inline-size: 160px;
      margin-block: 0;
      color: var(--texte);
    }

    a.bouton-alerte {
      --hauteur-bouton: var(--cible-tactile);
      flex-shrink: 0;
      color: var(--alerte-pleine-texte);
      background: var(--alerte-pleine);
    }
  `,
})
export class BandeauAlerte {
  readonly parametres = input.required<Record<string, string>>();
}
