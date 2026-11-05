import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-reclamations-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Réclamations à valider</h1>`,
})
export class ReclamationsPage {}
