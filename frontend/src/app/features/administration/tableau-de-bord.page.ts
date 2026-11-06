import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  ADMIN_ABUSE_SERVICE,
  ADMIN_CLAIM_SERVICE,
  ADMIN_DIRECTORY_SERVICE,
} from './services/admin.contrats';

@Component({
  selector: 'app-tableau-de-bord-page',
  imports: [RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'admin.bord.titre' | transloco }}</h1>
    <ul>
      @for (compteur of compteurs(); track compteur.cle) {
        <li>
          <a [routerLink]="compteur.lien">
            <strong>{{ compteur.valeur }}</strong>
            <span>{{ 'admin.bord.' + compteur.cle | transloco }}</span>
          </a>
        </li>
      }
    </ul>
  `,
  styleUrl: './admin-partage.scss',
  styles: `
    ul {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--e-3);
      padding: 0;
      margin: 0;
      list-style: none;
    }

    a {
      display: grid;
      gap: var(--e-1);
      padding: var(--e-4);
      color: var(--texte);
      text-decoration: none;
      background: var(--carte);
      border: 2px solid var(--carte-bord);
      border-radius: var(--rayon);
    }

    a:hover {
      border-color: var(--contour);
    }

    strong {
      font-family: var(--police-titre);
      font-size: 36px;
      color: var(--titre);
    }
  `,
})
export class TableauDeBordPage {
  private readonly demandes = toSignal(inject(ADMIN_CLAIM_SERVICE).listerDemandes(), {
    initialValue: [],
  });
  private readonly fiches = toSignal(inject(ADMIN_DIRECTORY_SERVICE).listerFiches(), {
    initialValue: [],
  });
  private readonly signalements = toSignal(inject(ADMIN_ABUSE_SERVICE).listerSignalements(), {
    initialValue: [],
  });

  protected readonly compteurs = computed(() => {
    const ajouts = this.demandes().filter((d) => d.demande.ajout).length;
    const inscrites = this.fiches().filter((f) => f.etat === 'inscrite' && !f.fermee).length;
    const ouvertes = this.fiches().filter((f) => !f.fermee).length;
    return [
      { cle: 'reclamations', valeur: this.demandes().length - ajouts, lien: '/admin/reclamations' },
      { cle: 'ajouts', valeur: ajouts, lien: '/admin/reclamations' },
      { cle: 'signalements', valeur: this.signalements().length, lien: '/admin/signalements' },
      { cle: 'inscrites', valeur: inscrites, lien: '/admin/annuaire' },
      { cle: 'nonInscrites', valeur: ouvertes - inscrites, lien: '/admin/annuaire' },
    ];
  });
}
