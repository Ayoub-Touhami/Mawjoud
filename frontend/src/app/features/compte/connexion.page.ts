import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Utilisateur } from '../../core/models';
import { AUTH_SERVICE, ErreurAuth } from '../../core/services/auth.service';
import { AuthServiceSimule } from '../../core/simulation/auth.service.simule';
import { environment } from '../../../environments/environment';
import { Bouton } from '../../shared/bouton/bouton';
import { Motif } from '../../shared/motif/motif';
import { Segment, Segments } from '../../shared/segments/segments';
import { ChampsCompte, ErreursChamps, verifierChamps } from './champs-compte';

type Mode = 'connexion' | 'creation';

/** La page de connexion est commune : le rôle du compte décide de la suite. */
function destinationParDefaut({ role, emailVerifie }: Utilisateur): string {
  if (role === 'administrateur') {
    return '/admin';
  }
  if (role === 'pharmacien') {
    return '/pharmacien';
  }
  return emailVerifie ? '/alertes' : '/compte/verification-email';
}

@Component({
  selector: 'app-connexion-page',
  imports: [Bouton, ChampsCompte, Motif, RouterLink, Segments, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './connexion.page.html',
  styleUrl: './connexion.page.scss',
})
export class ConnexionPage {
  private readonly auth = inject(AUTH_SERVICE);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  private readonly simulation = inject(AuthServiceSimule);

  protected readonly outils = environment.outilsSimulation;
  protected readonly mode = signal<Mode>('connexion');
  protected readonly email = signal('');
  protected readonly motDePasse = signal('');
  protected readonly erreurs = signal<ErreursChamps>({ email: null, motDePasse: null });
  protected readonly erreur = signal<ErreurAuth | null>(null);
  protected readonly envoi = signal(false);
  protected readonly creation = computed(() => this.mode() === 'creation');
  protected readonly modes = computed((): Segment<Mode>[] => [
    { valeur: 'connexion', libelle: this.transloco.translate('compte.onglets.connexion') },
    { valeur: 'creation', libelle: this.transloco.translate('compte.onglets.creation') },
  ]);

  protected connecterAdministrateurTest(): void {
    this.simulation.connecterAdministrateurTest();
    void this.router.navigateByUrl('/admin');
  }

  protected changerMode(mode: Mode): void {
    this.mode.set(mode);
    this.erreur.set(null);
    this.erreurs.set({ email: null, motDePasse: null });
  }

  protected async soumettre(evenement: Event): Promise<void> {
    evenement.preventDefault();
    const erreurs = verifierChamps(this.email(), this.motDePasse(), this.creation());
    this.erreurs.set(erreurs);
    this.erreur.set(null);
    if (erreurs.email || erreurs.motDePasse) {
      return;
    }
    this.envoi.set(true);
    try {
      const appel = this.creation()
        ? this.auth.creerCompte(this.email(), this.motDePasse())
        : this.auth.seConnecter(this.email(), this.motDePasse());
      const utilisateur = await firstValueFrom(appel);
      await this.router.navigateByUrl(
        this.destination() ?? destinationParDefaut(utilisateur),
      );
    } catch (erreur) {
      this.erreur.set(erreur as ErreurAuth);
    } finally {
      this.envoi.set(false);
    }
  }

  /** N'accepte qu'une adresse du site : un lien piégé ne doit pas renvoyer ailleurs. */
  private destination(): string | null {
    const retour = this.route.snapshot.queryParamMap.get('retour');
    return retour?.startsWith('/') && !retour.startsWith('//') ? retour : null;
  }
}
