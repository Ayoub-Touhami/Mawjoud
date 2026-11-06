import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { DateFrPipe } from './composants-admin';
import { ADMIN_CLAIM_SERVICE } from './services/admin.contrats';

@Component({
  selector: 'app-reclamations-page',
  imports: [DateFrPipe, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'pages.reclamations' | transloco }}</h1>
    <div class="defilement" tabindex="0" role="region" [attr.aria-label]="'pages.reclamations' | transloco">
      <table>
        <caption>{{ 'admin.demandes.legende' | transloco: { n: demandes().length } }}</caption>
        <thead>
          <tr>
            <th scope="col">{{ 'admin.demandes.type' | transloco }}</th>
            <th scope="col">{{ 'admin.demandes.pharmacie' | transloco }}</th>
            <th scope="col">{{ 'admin.demandes.demandeur' | transloco }}</th>
            <th scope="col">{{ 'admin.demandes.date' | transloco }}</th>
            <th scope="col">{{ 'admin.demandes.justificatif' | transloco }}</th>
            <th scope="col">{{ 'admin.demandes.dossier' | transloco }}</th>
          </tr>
        </thead>
        <tbody>
          @for (ligne of demandes(); track ligne.demande.id) {
            <tr>
              <td>
                {{
                  (ligne.demande.ajout
                    ? 'admin.demandes.ajout'
                    : ligne.demande.conflit
                      ? 'admin.demandes.conflit'
                      : 'admin.demandes.reclamation'
                  ) | transloco
                }}
              </td>
              <td>{{ ligne.pharmacie?.nom ?? ligne.demande.ajout?.nom }}</td>
              <td>{{ ligne.email }}</td>
              <td>{{ ligne.demande.creeeLe | dateFr }}</td>
              <td>
                {{
                  (ligne.demande.justificatif?.texte || ligne.demande.justificatif?.fichier
                    ? 'admin.demandes.fourni'
                    : 'admin.demandes.aucun'
                  ) | transloco
                }}
              </td>
              <td>
                <a class="lien" [routerLink]="['/admin/reclamations', ligne.demande.id]">
                  {{ 'admin.bord.ouvrir' | transloco }}
                </a>
              </td>
            </tr>
          } @empty {
            <tr>
              <td colspan="6" class="vide">{{ 'admin.demandes.vide' | transloco }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styleUrl: './admin-partage.scss',
})
export class ReclamationsPage {
  protected readonly demandes = toSignal(inject(ADMIN_CLAIM_SERVICE).listerDemandes(), {
    initialValue: [],
  });
}
