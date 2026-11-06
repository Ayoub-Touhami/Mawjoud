import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, map, of, switchMap } from 'rxjs';
import { FormatService } from '../../core/i18n/format.service';
import { Pharmacie } from '../../core/models';
import { estInscrite } from '../../core/outils/pharmacie.outils';
import { ConnexionService } from '../../core/services/connexion.service';
import { PHARMACIE_API } from '../../core/services/pharmacie-api';
import { PositionService } from '../../core/services/position.service';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { MessageEtat } from '../../shared/message-etat/message-etat';
import { BarreCarte } from './barre-carte';
import { CarteTunisie, EtatCarte } from './carte-tunisie';
import { CommandesCarte } from './commandes-carte';
import { DemandePosition } from './demande-position';
import { EcranCarte } from './ecran-carte';
import { FeuillePharmacie } from './feuille-pharmacie';
import { LegendeCarte } from './legende-carte';
import { MessagePositionCarte } from './message-position';

@Component({
  selector: 'app-accueil-page',
  imports: [
    BarreCarte,
    Bouton,
    CarteTunisie,
    CommandesCarte,
    EcranCarte,
    FeuillePharmacie,
    Icone,
    LegendeCarte,
    MessageEtat,
    MessagePositionCarte,
    RouterLink,
    TranslocoPipe,
  ],
  providers: [DemandePosition],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accueil.page.html',
  styleUrl: './accueil.page.scss',
})
export class AccueilPage {
  private readonly api = inject(PHARMACIE_API);
  private readonly format = inject(FormatService);
  private readonly connexion = inject(ConnexionService);
  private readonly carte = viewChild(CarteTunisie);

  private readonly essai = signal(0);
  private readonly resultat = toSignal(
    toObservable(this.essai).pipe(
      switchMap(() =>
        this.api.listerPharmacies().pipe(
          map((liste) => ({ liste, echec: false })),
          catchError(() => of({ liste: [] as Pharmacie[], echec: true })),
        ),
      ),
    ),
  );
  private readonly chargeeLe = signal<number | null>(null);
  private villeCadree = false;

  protected readonly etatCarte = signal<EtatCarte>('chargement');
  protected readonly selection = signal<Pharmacie | null>(null);
  protected readonly demande = inject(DemandePosition);
  protected readonly dernierecarteVue = signal(false);
  protected readonly ecranVilleFerme = signal(false);

  protected readonly position = inject(PositionService).position;
  protected readonly enLigne = this.connexion.enLigne;
  protected readonly pharmacies = computed(() => this.resultat()?.liste ?? []);
  protected readonly echec = computed(() => this.resultat()?.echec ?? false);
  protected readonly ville = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('ville'))),
  );
  private readonly pharmaciesDeLaVille = computed(() => {
    const ville = this.ville();
    return this.pharmacies().filter((p) => p.ville === ville);
  });
  protected readonly villeVide = computed(() => !this.pharmaciesDeLaVille().length);
  protected readonly ecranVille = computed(
    () =>
      !!this.ville() &&
      !this.ecranVilleFerme() &&
      !this.pharmaciesDeLaVille().some((p) => estInscrite(p)),
  );
  protected readonly ecranSignal = computed(() => !this.enLigne() && !this.dernierecarteVue());
  protected readonly vide = computed(
    () => !!this.resultat() && !this.echec() && !this.pharmacies().length,
  );
  protected readonly ageCarte = computed(() => {
    const date = this.chargeeLe();
    return date ? this.format.age(date) : this.format.age(Date.now());
  });

  constructor() {
    this.demande.auSucces = (position) => this.carte()?.allerA(position);
    effect(() => {
      if (this.enLigne()) {
        this.dernierecarteVue.set(false);
      }
    });
    effect(() => {
      if (this.etatCarte() === 'prete' && !this.ecranVille()) {
        this.cadrerVille();
      }
    });
  }

  protected suivreCarte(etat: EtatCarte): void {
    this.etatCarte.set(etat);
    if (etat === 'prete') {
      this.chargeeLe.set(Date.now());
    }
  }

  protected zoomer(ecart: number): void {
    this.carte()?.zoomer(ecart);
  }

  protected reessayerConnexion(): void {
    this.connexion.verifier();
    if (this.enLigne()) {
      this.carte()?.recharger();
    }
  }

  protected reessayerDonnees(): void {
    this.essai.update((n) => n + 1);
  }

  protected rechargerFond(): void {
    this.carte()?.recharger();
  }

  private cadrerVille(): void {
    if (this.ville() && !this.villeCadree && this.pharmaciesDeLaVille().length) {
      this.villeCadree = true;
      this.carte()?.cadrer(this.pharmaciesDeLaVille());
    }
  }
}
