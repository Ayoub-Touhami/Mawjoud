import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';

/** Page d'attente : la procédure n'est pas décidée (spécification, section 15, point 8). */
@Component({
  selector: 'app-mot-de-passe-oublie-page',
  imports: [Bouton, Icone, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <span class="signe"><app-icone nom="cadenas" [taille]="36" /></span>
      <h1>{{ 'pages.motDePasseOublie' | transloco }}</h1>
      <p>{{ 'compte.oublieTexte' | transloco }}</p>
      <div class="actions">
        <a appBouton routerLink="/compte/connexion">{{ 'navigation.seConnecter' | transloco }}</a>
      </div>
    </section>
  `,
  styleUrl: './page-compte.scss',
})
export class MotDePasseOubliePage {}
