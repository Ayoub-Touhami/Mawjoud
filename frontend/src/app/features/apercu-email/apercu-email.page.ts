import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { AlertServiceSimule } from '../../core/simulation/alert.service.simule';
import { DonneesEmail, GabaritEmail } from './gabarit-email';

/** Page de développement, absente du build de production. Pharmacie d'exemple du PDF. */
@Component({
  selector: 'app-apercu-email-page',
  imports: [GabaritEmail, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'pages.apercuEmail' | transloco }}</h1>
    <p>{{ 'email.apercu' | transloco }}</p>
    <app-gabarit-email [donnees]="donnees()" />
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--e-3);
      max-inline-size: 640px;
      margin-inline: auto;
    }

    h1,
    p {
      margin-block: 0;
    }
  `,
})
export class ApercuEmailPage {
  private readonly alertes = inject(AlertServiceSimule);

  protected readonly donnees = computed(
    (): DonneesEmail => ({
      medicament: 'Levothyrox 50 µg',
      lieu: { fr: 'Tunis', ar: 'تونس' },
      pharmacie: 'Pharmacie du Marché',
      adresse: '12, rue des Oliviers, Tunis',
      age: { fr: 'il y a 2 h', ar: 'منذ 2 س' },
      lienCarte: '/resultats?m=M015&zone=Tunis',
      lienDesabonnement: `/compte/desabonnement?jeton=${this.alertes.jetonDesabonnement() ?? 'exemple'}`,
      lienSuppression: '/compte/suppression',
    }),
  );
}
