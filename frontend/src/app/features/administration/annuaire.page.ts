import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-annuaire-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Annuaire des pharmacies</h1>`,
})
export class AnnuairePage {}
