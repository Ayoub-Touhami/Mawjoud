import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ALERT_SERVICE } from '../../core/services/alert.service';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';

/** Un clic sur le lien de l'e-mail suffit : la page agit dès son ouverture, sans connexion. */
@Component({
  selector: 'app-desabonnement-page',
  imports: [Bouton, Icone, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      @switch (etat()) {
        @case ('encours') {
          <h1>{{ 'compte.desabonnement.encours' | transloco }}</h1>
        }
        @case ('succes') {
          <span class="signe succes"><app-icone nom="coche" [taille]="36" /></span>
          <h1>{{ 'compte.desabonnement.succesTitre' | transloco }}</h1>
          <p>{{ 'compte.desabonnement.succesTexte' | transloco }}</p>
        }
        @default {
          <span class="signe alerte"><app-icone nom="fermer" [taille]="36" /></span>
          <h1>{{ 'compte.verification.invalideTitre' | transloco }}</h1>
          <p>{{ 'compte.desabonnement.invalideTexte' | transloco }}</p>
        }
      }
      <div class="actions">
        <a appBouton variante="secondaire" routerLink="/">{{ 'fiche.retour' | transloco }}</a>
      </div>
    </section>
  `,
  styleUrl: './page-compte.scss',
})
export class DesabonnementPage {
  private readonly alertes = inject(ALERT_SERVICE);

  protected readonly etat = signal<'encours' | 'succes' | 'invalide'>('encours');

  constructor() {
    void this.desabonner(inject(ActivatedRoute).snapshot.queryParamMap.get('jeton'));
  }

  private async desabonner(jeton: string | null): Promise<void> {
    try {
      await firstValueFrom(this.alertes.desabonner(jeton ?? ''));
      this.etat.set('succes');
    } catch {
      this.etat.set('invalide');
    }
  }
}
