import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AUTH_SERVICE } from '../../core/services/auth.service';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';

/** Ouverte depuis Mes alertes ou, après connexion, depuis le lien de l'e-mail. */
@Component({
  selector: 'app-suppression-compte-page',
  imports: [Bouton, Icone, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      @if (supprime()) {
        <span class="signe succes"><app-icone nom="coche" [taille]="36" /></span>
        <h1>{{ 'compte.suppression.succesTitre' | transloco }}</h1>
        <p role="status">{{ 'compte.suppression.succesTexte' | transloco }}</p>
        <div class="actions">
          <a appBouton routerLink="/">{{ 'fiche.retour' | transloco }}</a>
        </div>
      } @else {
        <span class="signe alerte"><app-icone nom="fermer" [taille]="36" /></span>
        <h1>{{ 'pages.suppressionCompte' | transloco }}</h1>
        <p>
          {{ 'compte.suppression.texte' | transloco: { email: utilisateur()?.email ?? '' } }}
        </p>
        <p class="important">{{ 'compte.suppression.definitif' | transloco }}</p>
        @if (erreur()) {
          <p class="important" role="alert">{{ 'compte.erreurs.indisponible' | transloco }}</p>
        }
        <div class="actions">
          <button type="button" appBouton [chargement]="envoi()" (click)="supprimer()">
            {{ 'compte.suppression.confirmer' | transloco }}
          </button>
          <a appBouton variante="secondaire" routerLink="/alertes">
            {{ 'carte.position.annuler' | transloco }}
          </a>
        </div>
      }
    </section>
  `,
  styleUrl: './page-compte.scss',
})
export class SuppressionComptePage {
  private readonly auth = inject(AUTH_SERVICE);

  protected readonly utilisateur = this.auth.utilisateur;
  protected readonly supprime = signal(false);
  protected readonly envoi = signal(false);
  protected readonly erreur = signal(false);

  protected async supprimer(): Promise<void> {
    this.envoi.set(true);
    this.erreur.set(false);
    try {
      await firstValueFrom(this.auth.supprimerCompte());
      this.supprime.set(true);
    } catch {
      this.erreur.set(true);
    } finally {
      this.envoi.set(false);
    }
  }
}
