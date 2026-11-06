import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';

@Component({
  selector: 'app-acces-refuse-page',
  imports: [Bouton, Icone, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <span class="signe alerte"><app-icone nom="cadenas" [taille]="36" /></span>
      <h1>{{ 'pages.accesRefuse' | transloco }}</h1>
      <p>{{ 'compte.accesRefuse' | transloco }}</p>
      <div class="actions">
        <a appBouton routerLink="/">{{ 'fiche.retour' | transloco }}</a>
      </div>
    </section>
  `,
  styleUrl: './page-compte.scss',
})
export class AccesRefusePage {}
