import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-connexion-page',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>{{ 'pages.connexion' | transloco }}</h1>`,
})
export class ConnexionPage {}
