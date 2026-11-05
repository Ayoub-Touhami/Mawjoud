import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { DesignArabe, DesignFrancais } from './design-langues';

/** Montre chaque composant dans les quatre combinaisons de langue et de thème. */
@Component({
  selector: 'app-design-page',
  imports: [DesignArabe, DesignFrancais, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'pages.design' | transloco }}</h1>
    <p>{{ 'design.reserve' | transloco }}</p>
    <div class="grille">
      <app-design-francais theme="clair" />
      <app-design-arabe theme="clair" />
      <app-design-francais theme="sombre" />
      <app-design-arabe theme="sombre" />
    </div>
  `,
  styles: `
    .grille {
      display: grid;
      gap: var(--e-5);
    }

    @media (min-width: 1200px) {
      .grille {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
  `,
})
export class DesignPage {}
