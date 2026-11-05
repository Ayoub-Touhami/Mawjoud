import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-inscription-pharmacien-page',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>{{ 'pages.inscriptionPharmacien' | transloco }}</h1>`,
})
export class InscriptionPharmacienPage {}
