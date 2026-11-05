import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-fiche-pharmacie-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Fiche pharmacie</h1>`,
})
export class FichePharmaciePage {}
