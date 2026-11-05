import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Bouton } from '../../shared/bouton/bouton';

@Component({
  selector: 'app-introuvable-page',
  imports: [Bouton, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'pages.introuvable' | transloco }}</h1>
    <p>{{ 'introuvable.texte' | transloco }}</p>
    <a appBouton routerLink="/">{{ 'introuvable.retour' | transloco }}</a>
  `,
})
export class IntrouvablePage {}
