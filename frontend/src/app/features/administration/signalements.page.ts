import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-signalements-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Signalements d'abus</h1>`,
})
export class SignalementsPage {}
