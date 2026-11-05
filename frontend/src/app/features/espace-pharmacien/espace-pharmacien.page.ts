import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-espace-pharmacien-page',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>{{ 'pages.espacePharmacien' | transloco }}</h1>`,
})
export class EspacePharmacienPage {}
