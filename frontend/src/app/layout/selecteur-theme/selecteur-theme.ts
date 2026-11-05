import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { ThemeService } from '../../core/services/theme.service';
import { Icone } from '../../shared/icone/icone';

@Component({
  selector: 'app-selecteur-theme',
  imports: [Icone, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let sombre = themes.theme() === 'sombre';
    <button
      type="button"
      [attr.aria-label]="(sombre ? 'theme.versClair' : 'theme.versSombre') | transloco"
      [title]="(sombre ? 'theme.versClair' : 'theme.versSombre') | transloco"
      (click)="themes.basculer()"
    >
      <app-icone [nom]="sombre ? 'soleil' : 'lune'" />
    </button>
  `,
  styles: `
    button {
      display: grid;
      place-items: center;
      inline-size: var(--cible-tactile);
      block-size: var(--cible-tactile);
      color: var(--titre);
      cursor: pointer;
      background: transparent;
      border: 1px solid var(--carte-bord);
      border-radius: var(--rayon-petit);
    }

    button:hover {
      background: var(--contour-survol);
    }
  `,
})
export class SelecteurTheme {
  protected readonly themes = inject(ThemeService);
}
