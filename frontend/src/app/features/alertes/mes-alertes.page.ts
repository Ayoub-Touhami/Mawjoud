import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-mes-alertes-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Mes alertes</h1>`,
})
export class MesAlertesPage {}
