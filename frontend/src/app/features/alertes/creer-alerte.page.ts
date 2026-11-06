import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom, of } from 'rxjs';
import { GOUVERNORATS } from '../../core/gouvernorats';
import { Medicament } from '../../core/models';
import { libelleMedicament } from '../../core/outils/recherche.outils';
import { ALERT_SERVICE } from '../../core/services/alert.service';
import { AUTH_SERVICE, ErreurAuth } from '../../core/services/auth.service';
import { PHARMACIE_API } from '../../core/services/pharmacie-api';
import { Bouton } from '../../shared/bouton/bouton';
import { Champ, Controle } from '../../shared/champ/champ';
import { Icone } from '../../shared/icone/icone';
import { RechercheMedicament } from '../../shared/recherche-medicament/recherche-medicament';
import { Segment, Segments } from '../../shared/segments/segments';
import { ChampsCompte, ErreursChamps, verifierChamps } from '../compte/champs-compte';

type Portee = 'ville' | 'toutes';
type Resultat = 'creee' | 'existante';

@Component({
  selector: 'app-creer-alerte-page',
  imports: [
    Bouton,
    Champ,
    ChampsCompte,
    Controle,
    Icone,
    RechercheMedicament,
    RouterLink,
    Segments,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './creer-alerte.page.html',
  styleUrl: './creer-alerte.page.scss',
})
export class CreerAlertePage {
  private readonly api = inject(PHARMACIE_API);
  private readonly auth = inject(AUTH_SERVICE);
  private readonly alertes = inject(ALERT_SERVICE);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  private readonly parametres = inject(ActivatedRoute).snapshot.queryParamMap;

  protected readonly gouvernorats = GOUVERNORATS;
  protected readonly utilisateur = this.auth.utilisateur;
  /** Texte d'une recherche sans résultat : il reste à choisir un médicament dans la liste. */
  protected readonly texteInitial = this.parametres.get('q') ?? '';
  private readonly medicamentArrive = toSignal(
    this.parametres.get('m')
      ? this.api.obtenirMedicament(this.parametres.get('m') as string)
      : of(undefined),
  );
  private readonly medicamentChoisi = signal<Medicament | null | undefined>(undefined);
  protected readonly medicament = computed(() =>
    this.medicamentChoisi() === undefined ? (this.medicamentArrive() ?? null) : this.medicamentChoisi(),
  );
  protected readonly nomMedicament = computed(() => {
    const medicament = this.medicamentArrive();
    return medicament ? libelleMedicament(medicament) : this.texteInitial;
  });

  protected readonly portee = signal<Portee>('ville');
  protected readonly zone = signal(this.parametres.get('zone') ?? 'Tunis');
  protected readonly connexion = signal(false);
  protected readonly email = signal('');
  protected readonly motDePasse = signal('');
  protected readonly erreurs = signal<ErreursChamps>({ email: null, motDePasse: null });
  protected readonly erreurMedicament = signal(false);
  protected readonly erreur = signal<ErreurAuth | null>(null);
  protected readonly envoi = signal(false);
  protected readonly resultat = signal<Resultat | null>(null);

  protected readonly portees = computed((): Segment<Portee>[] => [
    { valeur: 'ville', libelle: this.transloco.translate('alertes.uneVille') },
    { valeur: 'toutes', libelle: this.transloco.translate('alertes.toutes') },
  ]);

  protected choisirMedicament(medicament: Medicament | null): void {
    this.medicamentChoisi.set(medicament);
    this.erreurMedicament.set(false);
  }

  protected basculerConnexion(): void {
    this.connexion.update((valeur) => !valeur);
    this.erreur.set(null);
    this.erreurs.set({ email: null, motDePasse: null });
  }

  protected async creer(evenement: Event): Promise<void> {
    evenement.preventDefault();
    const medicament = this.medicament();
    const compteAFaire = !this.utilisateur();
    const erreurs = compteAFaire
      ? verifierChamps(this.email(), this.motDePasse(), !this.connexion())
      : { email: null, motDePasse: null };
    this.erreurs.set(erreurs);
    this.erreurMedicament.set(!medicament);
    this.erreur.set(null);
    if (!medicament || erreurs.email || erreurs.motDePasse) {
      return;
    }
    this.envoi.set(true);
    try {
      if (compteAFaire) {
        await firstValueFrom(
          this.connexion()
            ? this.auth.seConnecter(this.email(), this.motDePasse())
            : this.auth.creerCompte(this.email(), this.motDePasse()),
        );
      }
      const ville = this.portee() === 'ville' ? this.zone() : null;
      const { existante } = await firstValueFrom(
        this.alertes.creerAlerte(medicament.id, ville),
      );
      if (existante) {
        this.resultat.set('existante');
      } else if (this.utilisateur()?.emailVerifie) {
        this.resultat.set('creee');
      } else {
        await this.router.navigate(['/compte/verification-email']);
      }
    } catch (erreur) {
      this.erreur.set(erreur as ErreurAuth);
    } finally {
      this.envoi.set(false);
    }
  }
}
