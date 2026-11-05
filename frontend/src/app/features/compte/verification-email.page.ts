import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-verification-email-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>Vérification de l'e-mail</h1>`,
})
export class VerificationEmailPage {}
