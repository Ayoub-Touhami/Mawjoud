import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-resultats-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Résultats</h1>`,
})
export class ResultatsPage {}
