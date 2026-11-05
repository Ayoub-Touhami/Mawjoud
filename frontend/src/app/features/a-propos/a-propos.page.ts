import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-a-propos-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>À propos et contact</h1>`,
})
export class AProposPage {}
