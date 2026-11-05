import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-accueil-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Carte des pharmacies</h1>`,
})
export class AccueilPage {}
