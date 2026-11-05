import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-introuvable-page',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>Page introuvable</h1>
    <p>Cette adresse n'existe pas sur Mawjoud.</p>
    <a routerLink="/">Retour à la carte</a>
  `,
})
export class IntrouvablePage {}
