import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { ErreurAuth } from '../../core/services/auth.service';
import { PHARMACIST_AUTH_SERVICE } from '../../core/services/pharmacist-auth.service';
import { Bouton } from '../../shared/bouton/bouton';
import { ChampsCompte, ErreursChamps, verifierChamps } from '../compte/champs-compte';
import { EtapesPharmacien } from './etapes-pharmacien';

/** Étape « Compte » : même formulaire que le patient, puis vérification de l'adresse. */
@Component({
  selector: 'app-inscription-pharmacien-page',
  imports: [Bouton, ChampsCompte, EtapesPharmacien, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="page">
      <p class="surtitre">{{ 'pages.espacePharmacien' | transloco }}</p>
      <app-etapes-pharmacien [active]="1" />
      <h1>{{ 'pharmacien.inscription.titre' | transloco }}</h1>
      <p>{{ 'pharmacien.inscription.intro' | transloco }}</p>

      <form novalidate (submit)="soumettre($event)">
        <app-champs-compte
          [(email)]="email"
          [(motDePasse)]="motDePasse"
          [nouveau]="true"
          [erreurs]="erreurs()"
        />
        @if (erreur(); as code) {
          <div class="erreur" role="alert">
            <p>{{ 'compte.erreurs.' + code | transloco }}</p>
            @if (code === 'email-utilise') {
              <a appBouton variante="lien" routerLink="/compte/connexion">
                {{ 'navigation.seConnecter' | transloco }}
              </a>
            }
          </div>
        }
        <button type="submit" appBouton [chargement]="envoi()">
          {{ 'compte.creer' | transloco }}
        </button>
      </form>

      <p class="note">{{ 'pharmacien.inscription.note' | transloco }}</p>
      <a class="lien" routerLink="/compte/connexion">
        {{ 'pharmacien.inscription.dejaCompte' | transloco }}
      </a>
    </section>
  `,
  styleUrl: './page-pharmacien.scss',
})
export class InscriptionPharmacienPage {
  private readonly pharmaciens = inject(PHARMACIST_AUTH_SERVICE);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly motDePasse = signal('');
  protected readonly erreurs = signal<ErreursChamps>({ email: null, motDePasse: null });
  protected readonly erreur = signal<ErreurAuth | null>(null);
  protected readonly envoi = signal(false);

  protected async soumettre(evenement: Event): Promise<void> {
    evenement.preventDefault();
    const erreurs = verifierChamps(this.email(), this.motDePasse(), true);
    this.erreurs.set(erreurs);
    this.erreur.set(null);
    if (erreurs.email || erreurs.motDePasse) {
      return;
    }
    this.envoi.set(true);
    try {
      await firstValueFrom(this.pharmaciens.creerCompte(this.email(), this.motDePasse()));
      await this.router.navigate(['/compte/verification-email']);
    } catch (erreur) {
      this.erreur.set(erreur as ErreurAuth);
    } finally {
      this.envoi.set(false);
    }
  }
}
