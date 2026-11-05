import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { LangueService } from '../../core/i18n/langue.service';

/** Affiche l'autre langue, écrite dans cette langue, comme sur les maquettes. */
@Component({
  selector: 'app-selecteur-langue',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      [attr.lang]="'langue.autreCode' | transloco"
      [attr.aria-label]="'langue.changer' | transloco"
      (click)="langues.basculer()"
    >
      {{ 'langue.autre' | transloco }}
    </button>
  `,
  styles: `
    button {
      min-inline-size: var(--cible-tactile);
      min-block-size: var(--cible-tactile);
      padding-inline: var(--e-3);
      font-family: var(--police-texte);
      font-size: 15px;
      font-weight: 600;
      color: var(--tonal-texte);
      cursor: pointer;
      background: var(--tonal);
      border: 0;
      border-radius: var(--rayon-petit);
    }

    button:hover {
      background: var(--tonal-survol);
    }
  `,
})
export class SelecteurLangue {
  protected readonly langues = inject(LangueService);
}
