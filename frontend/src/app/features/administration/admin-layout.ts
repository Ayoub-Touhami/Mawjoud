import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { provideTranslocoLang, TranslocoPipe } from '@jsverse/transloco';

/** L'administration reste en français et de gauche à droite, quelle que soit la langue du site. */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoPipe],
  providers: [provideTranslocoLang('fr')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="admin" lang="fr" dir="ltr">
      <nav [attr.aria-label]="'admin.navigation' | transloco">
        <a routerLink="/admin" routerLinkActive="actif" [routerLinkActiveOptions]="{ exact: true }">
          {{ 'admin.bord.titre' | transloco }}
        </a>
        <a routerLink="/admin/reclamations" routerLinkActive="actif">
          {{ 'pages.reclamations' | transloco }}
        </a>
        <a routerLink="/admin/annuaire" routerLinkActive="actif">
          {{ 'pages.annuaire' | transloco }}
        </a>
        <a routerLink="/admin/signalements" routerLinkActive="actif">
          {{ 'pages.signalements' | transloco }}
        </a>
        <a routerLink="/admin/journal" routerLinkActive="actif">
          {{ 'pages.journal' | transloco }}
        </a>
      </nav>
      <div class="contenu"><router-outlet /></div>
    </div>
  `,
  styles: `
    .admin {
      display: grid;
      gap: var(--e-4);
      max-inline-size: 1240px;
      margin-inline: auto;
    }

    nav {
      display: flex;
      gap: var(--e-1);
      overflow-x: auto;
    }

    a {
      display: inline-flex;
      flex-shrink: 0;
      align-items: center;
      min-block-size: var(--cible-tactile);
      padding-inline: var(--e-3);
      font-weight: 600;
      color: var(--texte);
      text-decoration: none;
      border-radius: var(--rayon-petit);
    }

    a:hover {
      background: var(--contour-survol);
    }

    a.actif {
      color: var(--tonal-texte);
      background: var(--tonal);
    }

    .contenu {
      min-inline-size: 0;
    }

    @media (min-width: 960px) {
      .admin {
        grid-template-columns: 220px minmax(0, 1fr);
      }

      nav {
        flex-direction: column;
        overflow: visible;
      }
    }
  `,
})
export class AdminLayout {}
