import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-creer-alerte-page',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>{{ 'pages.creerAlerte' | transloco }}</h1>`,
})
export class CreerAlertePage {}
