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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { catchError, combineLatest, forkJoin, map, Observable, of, startWith, switchMap } from 'rxjs';
import { GOUVERNORATS } from '../../core/gouvernorats';
import { LangueService } from '../../core/i18n/langue.service';
import { Medicament, Pharmacie, Stock } from '../../core/models';
import { contientArabe, libelleMedicament } from '../../core/outils/recherche.outils';
import { ConnexionService } from '../../core/services/connexion.service';
import { FraicheurService } from '../../core/services/fraicheur.service';
import { HORLOGE } from '../../core/services/horloge';
import { PHARMACIE_API } from '../../core/services/pharmacie-api';
import { PositionService } from '../../core/services/position.service';
import { dansTunisie } from '../carte/cadrage';
import { Coordonnees } from '../../core/outils/pharmacie.outils';
import { STOCK_SERVICE } from '../../core/services/stock.service';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { MessageEtat } from '../../shared/message-etat/message-etat';
import { RechercheMedicament } from '../../shared/recherche-medicament/recherche-medicament';
import { CarteTunisie, EtatCarte } from '../carte/carte-tunisie';
import { CommandesCarte } from '../carte/commandes-carte';
import { DemandePosition } from '../carte/demande-position';
import { EcranCarte } from '../carte/ecran-carte';
import { FeuillePharmacie, InfoMedicament } from '../carte/feuille-pharmacie';
import { LegendeCarte } from '../carte/legende-carte';
import { MessagePositionCarte } from '../carte/message-position';
import { BandeauAlerte } from './bandeau-alerte';
import { CarteResultat } from './carte-resultat';
import { construireGroupes, enRupturePartout, LigneResultat } from './resultats.outils';

type Vue =
  | { type: 'aide' | 'chargement' | 'erreur' }
  | { type: 'choix'; texte: string; medicaments: Medicament[] }
  | { type: 'aucun'; texte: string; proches: Medicament[] }
  | { type: 'resultats'; medicament: Medicament; stocks: Stock[] };

/** Nombre de pharmacies non inscrites montrées avant le bouton « Voir plus ». */
const PAS_NON_INSCRITES = 20;

import { iconeForme } from '../../core/outils/forme-medicament';

@Component({
  selector: 'app-resultats-page',
  imports: [
    BandeauAlerte,
    Bouton,
    CarteResultat,
    CarteTunisie,
    CommandesCarte,
    EcranCarte,
    FeuillePharmacie,
    Icone,
    LegendeCarte,
    MessageEtat,
    MessagePositionCarte,
    RechercheMedicament,
    RouterLink,
    TranslocoPipe,
  ],
  providers: [DemandePosition],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resultats.page.html',
  styleUrls: ['./resultats.page.scss', './resultats-liste.scss'],
})
export class ResultatsPage {
  protected readonly iconeForme = iconeForme;
  private readonly api = inject(PHARMACIE_API);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly connexion = inject(ConnexionService);
  private readonly stocksService = inject(STOCK_SERVICE);
  private readonly fraicheur = inject(FraicheurService);
  private readonly horloge = inject(HORLOGE);
  private readonly transloco = inject(TranslocoService);
  private readonly langue = inject(LangueService).langue;
  private readonly carte = viewChild(CarteTunisie);

  protected readonly demande = inject(DemandePosition);
  protected readonly gouvernorats = GOUVERNORATS;
  protected readonly libelle = libelleMedicament;
  protected readonly enLigne = this.connexion.enLigne;
  protected readonly position = inject(PositionService).position;

  private readonly essai = signal(0);
  private readonly positions = inject(PositionService);
  protected readonly autourEnCours = signal(false);

  /**
   * « Autour de moi » : demande la position au navigateur. Accordée et en Tunisie : tri par distance.
   * Refusée ou indisponible : rien ne change (tri par gouvernorat), sans message d'erreur.
   * La position reste en mémoire pendant la visite seulement (PositionService).
   */
  protected async autourDeMoi(): Promise<void> {
    this.autourEnCours.set(true);
    try {
      const position = await this.positions.obtenir();
      if (dansTunisie(position)) this.positions.fixer(position);
    } catch {
      // refus ou position indisponible : on garde le tri par gouvernorat
    } finally {
      this.autourEnCours.set(false);
    }
  }
  private readonly parametres = toSignal(this.route.queryParamMap, { requireSync: true });
  protected readonly zone = computed(() => this.parametres().get('zone'));

  protected readonly toutes = toSignal(
    this.api.listerPharmacies().pipe(catchError(() => of<Pharmacie[]>([]))),
    { initialValue: [] },
  );
  protected readonly vue = toSignal(
    combineLatest([this.route.queryParamMap, toObservable(this.essai), toObservable(this.position)]).pipe(
      switchMap(([params, , position]) =>
        this.charger(params.get('m'), params.get('q'), position).pipe(
          startWith<Vue>({ type: 'chargement' }),
          catchError(() => of<Vue>({ type: 'erreur' })),
        ),
      ),
    ),
    { initialValue: { type: 'chargement' } as Vue },
  );

  protected readonly selection = signal<Pharmacie | null>(null);
  protected readonly etatCarte = signal<EtatCarte>('chargement');
  protected readonly reduite = signal(false);
  protected readonly limiteNonInscrites = signal(PAS_NON_INSCRITES);
  private departGlissement = 0;

  private readonly resultat = computed(() => {
    const vue = this.vue();
    return vue.type === 'resultats' ? vue : null;
  });
  protected readonly medicament = computed(() => this.resultat()?.medicament ?? null);
  protected readonly groupes = computed(() => {
    const resultat = this.resultat();
    return resultat
      ? construireGroupes(
          this.toutes(),
          resultat.stocks,
          this.zone(),
          this.position(),
          this.horloge(),
        )
      : null;
  });
  protected readonly nonInscritesVisibles = computed(
    () => this.groupes()?.nonInscrites.slice(0, this.limiteNonInscrites()) ?? [],
  );
  protected readonly resteNonInscrites = computed(
    () => (this.groupes()?.nonInscrites.length ?? 0) - this.limiteNonInscrites(),
  );
  private readonly lignes = computed(() => {
    const groupes = this.groupes();
    return groupes ? [...groupes.declares, ...groupes.nonDeclares, ...groupes.nonInscrites] : [];
  });
  /** La carte ne garde que les pharmacies de la recherche ; sans recherche, elle les montre toutes. */
  protected readonly pharmaciesCarte = computed(() =>
    this.groupes() ? this.lignes().map((l) => l.pharmacie) : this.toutes(),
  );
  protected readonly rupturePartout = computed(() => {
    const groupes = this.groupes();
    return !!groupes && enRupturePartout(groupes);
  });
  protected readonly sansDeclaration = computed(() => {
    const groupes = this.groupes();
    return !!groupes && !groupes.declares.length && this.lignes().length > 0;
  });
  protected readonly nomZone = computed(() => {
    const zone = this.zone();
    this.langue();
    return zone
      ? this.transloco.translate(`gouvernorats.${zone}`)
      : this.transloco.translate('recherche.toutePays');
  });
  protected readonly texteChamp = computed(() => {
    const vue = this.vue();
    if (vue.type === 'resultats') {
      return libelleMedicament(vue.medicament);
    }
    return vue.type === 'aucun' || vue.type === 'choix'
      ? vue.texte
      : (this.parametres().get('q') ?? '');
  });
  protected readonly parametresAlerte = computed((): Record<string, string> => {
    const medicament = this.medicament();
    const zone = this.zone();
    return {
      ...(medicament ? { m: medicament.id } : { q: this.texteChamp() }),
      ...(zone ? { zone } : {}),
    };
  });
  protected readonly lettresArabes = computed(() => contientArabe(this.texteChamp()));
  protected readonly titre = computed(() => {
    const medicament = this.medicament();
    this.langue();
    return medicament
      ? this.transloco.translate('recherche.titre', { nom: libelleMedicament(medicament) })
      : this.transloco.translate('pages.resultats');
  });
  protected readonly infoMedicament = computed((): InfoMedicament | null => {
    const pharmacie = this.selection();
    const medicament = this.medicament();
    if (!pharmacie || !medicament) {
      return null;
    }
    const ligne = this.lignes().find((l) => l.pharmacie.id === pharmacie.id);
    return {
      nom: libelleMedicament(medicament),
      statut: ligne?.statut ?? null,
      detail: ligne ? this.detail(ligne) : '',
    };
  });

  constructor() {
    this.demande.auSucces = (position) => this.carte()?.allerA(position);
    effect(() => {
      // Une nouvelle recherche ou une nouvelle zone repart de la liste.
      this.vue();
      this.zone();
      this.selection.set(null);
      this.reduite.set(false);
      this.limiteNonInscrites.set(PAS_NON_INSCRITES);
    });
    effect(() => {
      const liste = this.pharmaciesCarte();
      if (this.etatCarte() === 'prete' && this.zone()) {
        this.carte()?.cadrer(liste);
      }
    });
    effect(() => {
      const vue = this.vue();
      if (vue.type === 'choix' && vue.medicaments.length === 1) {
        this.ouvrir(vue.medicaments[0], true);
      }
    });
  }

  protected ouvrir(medicament: Medicament, remplacer = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { m: medicament.id, q: null },
      queryParamsHandling: 'merge',
      replaceUrl: remplacer,
    });
  }

  protected changerZone(zone: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { zone: zone || null },
      queryParamsHandling: 'merge',
    });
  }

  protected choisir(ligne: LigneResultat): void {
    this.selection.set(ligne.pharmacie);
  }

  protected voirPlus(): void {
    this.limiteNonInscrites.update((n) => n + PAS_NON_INSCRITES);
  }

  protected reessayer(): void {
    this.connexion.verifier();
    this.essai.update((n) => n + 1);
    if (this.enLigne()) {
      this.carte()?.recharger();
    }
  }

  protected commencerGlissement(evenement: PointerEvent): void {
    this.departGlissement = evenement.clientY;
  }

  protected finirGlissement(evenement: PointerEvent): void {
    const ecart = evenement.clientY - this.departGlissement;
    if (Math.abs(ecart) > 32) {
      this.reduite.set(ecart > 0);
    } else {
      this.reduite.update((valeur) => !valeur);
    }
  }

  private detail({ stock }: LigneResultat): string {
    if (!stock) {
      return '';
    }
    const { aConfirmer, age, detail } = this.fraicheur.lire(stock);
    return aConfirmer ? detail : this.transloco.translate('recherche.misAJour', { age });
  }

  private charger(id: string | null, texte: string | null, position: Coordonnees | null = null): Observable<Vue> {
    if (id) {
      return forkJoin({
        medicament: this.api.obtenirMedicament(id),
        stocks: this.stocksService.stocksDeMedicament(id, position),
      }).pipe(
        map(({ medicament, stocks }): Vue =>
          medicament
            ? { type: 'resultats', medicament, stocks }
            : { type: 'aucun', texte: id, proches: [] },
        ),
      );
    }
    if (!texte?.trim()) {
      return of({ type: 'aide' });
    }
    return this.api.chercherMedicaments(texte).pipe(
      switchMap((medicaments): Observable<Vue> =>
        medicaments.length
          ? of({ type: 'choix', texte, medicaments })
          : this.api
              .medicamentsProches(texte)
              .pipe(map((proches): Vue => ({ type: 'aucun', texte, proches }))),
      ),
    );
  }
}
