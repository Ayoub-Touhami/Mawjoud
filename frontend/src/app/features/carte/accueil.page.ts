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
import { ErreurPosition, PositionService } from '../../core/services/position.service';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { MessageEtat } from '../../shared/message-etat/message-etat';
import { BarreCarte } from './barre-carte';
import { dansTunisie } from './cadrage';
import { CarteTunisie, EtatCarte } from './carte-tunisie';
import { CommandesCarte } from './commandes-carte';
import { EcranCarte } from './ecran-carte';
import { FeuillePharmacie } from './feuille-pharmacie';
import { LegendeCarte } from './legende-carte';

type MessagePosition = 'pourquoi' | ErreurPosition | 'horsTunisie';

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
    RouterLink,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './accueil.page.html',
  styleUrl: './accueil.page.scss',
})
export class AccueilPage {
  private readonly api = inject(PHARMACIE_API);
  private readonly format = inject(FormatService);
  private readonly positions = inject(PositionService);
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
  private accordPosition = false;
  private villeCadree = false;

  protected readonly etatCarte = signal<EtatCarte>('chargement');
  protected readonly selection = signal<Pharmacie | null>(null);
  protected readonly message = signal<MessagePosition | null>(null);
  protected readonly rechercheEnCours = signal(false);
  protected readonly dernierecarteVue = signal(false);
  protected readonly ecranVilleFerme = signal(false);

  protected readonly position = this.positions.position;
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

  protected demanderPosition(): void {
    if (this.accordPosition) {
      void this.localiser();
    } else {
      this.message.set('pourquoi');
    }
  }

  protected accepterPosition(): void {
    this.accordPosition = true;
    void this.localiser();
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

  private async localiser(): Promise<void> {
    this.message.set(null);
    this.rechercheEnCours.set(true);
    try {
      const position = await this.positions.obtenir();
      if (dansTunisie(position)) {
        this.positions.fixer(position);
        this.carte()?.allerA(position);
      } else {
        this.positions.fixer(null);
        this.message.set('horsTunisie');
      }
    } catch (erreur) {
      this.message.set(erreur as ErreurPosition);
    } finally {
      this.rechercheEnCours.set(false);
    }
  }

  private cadrerVille(): void {
    if (this.ville() && !this.villeCadree && this.pharmaciesDeLaVille().length) {
      this.villeCadree = true;
      this.carte()?.cadrer(this.pharmaciesDeLaVille());
    }
  }
}
