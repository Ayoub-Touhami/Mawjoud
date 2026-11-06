import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Icone } from '../../shared/icone/icone';
import { MarqueurPharmacie } from '../../shared/marqueur-pharmacie/marqueur-pharmacie';
import { Motif } from '../../shared/motif/motif';

/** Écrans du PDF qui remplacent la carte : « signal coupé » et « aucune pharmacie inscrite ». */
@Component({
  selector: 'app-ecran-carte',
  imports: [Icone, MarqueurPharmacie, Motif],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-content select="[haut]" />
    @if (illustration() === 'signal') {
      <div class="illustration signal" aria-hidden="true">
        <span class="cercle"><app-icone nom="hors-connexion" [taille]="88" /></span>
      </div>
    } @else if (illustration() === 'recherche') {
      <div class="illustration signal" aria-hidden="true">
        <span class="cercle"><app-icone nom="gelule" [taille]="88" /></span>
      </div>
    } @else {
      <app-motif class="illustration" aria-hidden="true">
        <span class="enseigne">
          <app-icone nom="croix-pharmacie" [taille]="72" />
          <app-marqueur-pharmacie [inscrite]="false" />
        </span>
      </app-motif>
    }
    <h2>{{ titre() }}</h2>
    <p>{{ texte() }}</p>
    <div class="actions"><ng-content /></div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--e-4);
      block-size: 100%;
      padding: var(--e-4);
      overflow-y: auto;
      background: var(--fond);
    }

    .illustration {
      display: grid;
      flex-shrink: 0;
      place-items: center;
      min-block-size: 240px;
      background: var(--panneau-menthe);
      border-radius: var(--rayon-grand);
    }

    .cercle {
      display: grid;
      place-items: center;
      inline-size: 168px;
      block-size: 168px;
      color: var(--titre);
      background: var(--carte);
      border: 4px solid var(--titre);
      border-radius: 50%;
      box-shadow:
        0 0 0 28px var(--panneau-menthe),
        0 0 0 29px var(--tonal);
    }

    .enseigne {
      position: relative;
      display: grid;
      place-items: center;
      min-block-size: 240px;
      color: var(--titre);
    }

    h2 {
      margin-block: 0;
      font-size: 28px;
      overflow-wrap: anywhere;
    }

    p {
      margin-block: 0;
    }

    .actions {
      display: grid;
      gap: var(--e-3);
      margin-block-start: auto;
    }

    @media (min-width: 860px) {
      :host {
        inline-size: min(520px, 100%);
        margin-inline: auto;
      }
    }
  `,
})
export class EcranCarte {
  readonly illustration = input.required<'signal' | 'ville' | 'recherche'>();
  readonly titre = input.required<string>();
  readonly texte = input.required<string>();
}
