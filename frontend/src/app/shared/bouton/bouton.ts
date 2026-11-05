import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
} from '@angular/core';
import { Icone } from '../icone/icone';
import { NomIcone } from '../icone/icones';

export type VarianteBouton = 'principal' | 'menthe' | 'secondaire' | 'alerte' | 'lien';

/** Bouton de la charte, à poser sur un <button> ou un <a> : <button appBouton>…</button>. */
@Component({
  selector: 'button[appBouton], a[appBouton]',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (chargement()) {
      <span class="roue" aria-hidden="true"></span>
    } @else if (icone(); as nom) {
      <app-icone [nom]="nom" [taille]="22" />
    }
    <span><ng-content /></span>
  `,
  styleUrl: './bouton.scss',
  host: {
    '[class]': 'classes()',
    '[attr.disabled]': 'estBouton && desactive() ? "" : null',
    '[attr.aria-disabled]': 'inactif() ? "true" : null',
    '[attr.aria-busy]': 'chargement() ? "true" : null',
    '[attr.tabindex]': '!estBouton && desactive() ? -1 : null',
  },
})
export class Bouton {
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly estBouton = this.element.tagName === 'BUTTON';

  readonly variante = input<VarianteBouton>('principal');
  readonly icone = input<NomIcone>();
  readonly desactive = input(false);
  /** Garde le focus sur le bouton et bloque les clics pendant l'attente. */
  readonly chargement = input(false);

  protected readonly inactif = computed(() => this.desactive() || this.chargement());
  protected readonly classes = computed(
    () => `bouton bouton-${this.variante()}${this.chargement() ? ' en-chargement' : ''}`,
  );

  constructor() {
    // En phase de capture : le clic doit être arrêté avant le (click) posé par la page.
    this.element.addEventListener('click', (evenement) => this.bloquer(evenement), {
      capture: true,
    });
  }

  private bloquer(evenement: Event): void {
    if (this.inactif()) {
      evenement.preventDefault();
      evenement.stopImmediatePropagation();
    }
  }
}
