import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-verification-email-page',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<h1>{{ 'pages.verificationEmail' | transloco }}</h1>`,
})
export class VerificationEmailPage {}
