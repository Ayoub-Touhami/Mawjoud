import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AuthServiceSimule } from '../../core/simulation/auth.service.simule';
import { environment } from '../../../environments/environment';

/** Développement uniquement : remplace l'e-mail qu'aucun serveur n'envoie encore. */
@Component({
  selector: 'app-lien-test-email',
  imports: [RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (actif && jeton(); as valeur) {
      <aside>
        <p>{{ 'compte.test.texte' | transloco }}</p>
        <a routerLink="/compte/verification-email" [queryParams]="{ jeton: valeur }">
          {{ 'compte.test.ouvrir' | transloco }}
        </a>
        <button type="button" (click)="expirer(valeur)">
          {{ 'compte.test.expirer' | transloco }}
        </button>
      </aside>
    }
  `,
  styles: `
    aside {
      display: grid;
      gap: var(--e-1);
      justify-items: start;
      padding: var(--e-3) var(--e-4);
      border: 2px dashed var(--statut-tirets);
      border-radius: var(--rayon);
    }

    p {
      margin-block: 0;
      font-size: 14px;
      color: var(--texte-secondaire);
    }

    a,
    button {
      min-block-size: var(--cible-tactile);
      padding: 0;
      font: inherit;
      color: var(--lien);
      text-decoration: underline;
      cursor: pointer;
      background: none;
      border: 0;
    }

    a {
      display: inline-flex;
      align-items: center;
    }
  `,
})
export class LienTestEmail {
  /** Change à chaque renvoi, pour relire le jeton. */
  readonly version = input(0);

  private readonly auth = inject(AuthServiceSimule);
  private readonly router = inject(Router);
  protected readonly actif = environment.outilsSimulation;
  protected readonly jeton = computed(() => {
    this.version();
    return this.auth.jetonEnAttente();
  });

  protected expirer(jeton: string): void {
    this.auth.expirerLien(jeton);
    void this.router.navigate(['/compte/verification-email'], { queryParams: { jeton } });
  }
}
