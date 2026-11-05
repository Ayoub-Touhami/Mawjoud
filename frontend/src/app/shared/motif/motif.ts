import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Motif en étoile à huit branches, purement décoratif. Il occupe son propre espace :
 * ne jamais y poser du texte courant (règle du PDF de design).
 * « auto » suit le thème de la zone où il se trouve.
 */
@Component({
  selector: 'app-motif',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="fond clair" aria-hidden="true"></span>
    <span class="fond sombre" aria-hidden="true"></span>
    <ng-content />
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      min-block-size: 96px;
      overflow: hidden;
      border-radius: inherit;
    }

    .fond {
      position: absolute;
      inset: 0;
      background-repeat: repeat;
    }

    .clair {
      display: var(--pour-clair);
      background-image: url('/assets/svg/motif/etoile-huit-branches-clair.svg');
    }

    .sombre {
      display: var(--pour-sombre);
      background-image: url('/assets/svg/motif/etoile-huit-branches-sombre.svg');
    }

    :host(.ton-clair) .clair,
    :host(.ton-sombre) .sombre {
      display: block;
    }

    :host(.ton-clair) .sombre,
    :host(.ton-sombre) .clair {
      display: none;
    }
  `,
  host: { '[class]': '"ton-" + ton()' },
})
export class Motif {
  readonly ton = input<'auto' | 'clair' | 'sombre'>('auto');
}
