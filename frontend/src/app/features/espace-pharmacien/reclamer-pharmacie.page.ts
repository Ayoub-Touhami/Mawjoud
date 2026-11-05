import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-reclamer-pharmacie-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Réclamer ma pharmacie</h1>`,
})
export class ReclamerPharmaciePage {}
