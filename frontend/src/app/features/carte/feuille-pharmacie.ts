import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  viewChild,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { switchMap } from 'rxjs';
import { FormatService } from '../../core/i18n/format.service';
import { Pharmacie } from '../../core/models';
import { distanceMetres, estInscrite, etatOuverture } from '../../core/outils/pharmacie.outils';
import { PHARMACIE_API } from '../../core/services/pharmacie-api';
import { PositionService } from '../../core/services/position.service';
import { ActionsPharmacie } from '../../shared/actions-pharmacie/actions-pharmacie';
import { Icone } from '../../shared/icone/icone';
import { PastilleStatut } from '../../shared/pastille-statut/pastille-statut';

/** Distance vers le bas à partir de laquelle un glissement ferme la feuille. */
const GLISSEMENT_FERMETURE = 48;

/** Feuille du bas sur mobile, panneau flottant sur ordinateur. */
@Component({
  selector: 'app-feuille-pharmacie',
  imports: [ActionsPharmacie, Icone, PastilleStatut, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './feuille-pharmacie.html',
  styleUrl: './feuille-pharmacie.scss',
  host: {
    role: 'region',
    '[attr.aria-labelledby]': '"titre-feuille"',
    '(document:keydown.escape)': 'fermer.emit()',
  },
})
export class FeuillePharmacie {
  readonly pharmacie = input.required<Pharmacie>();
  readonly fermer = output<void>();

  private readonly api = inject(PHARMACIE_API);
  private readonly format = inject(FormatService);
  private readonly position = inject(PositionService).position;
  private readonly titre = viewChild.required<ElementRef<HTMLElement>>('titre');
  private departGlissement = 0;

  private readonly stocks = toSignal(
    toObservable(this.pharmacie).pipe(switchMap((p) => this.api.stocksDePharmacie(p.id))),
    { initialValue: [] },
  );

  protected readonly inscrite = computed(() => estInscrite(this.pharmacie()));
  protected readonly ouverture = computed(() => etatOuverture(this.pharmacie().horaires));
  protected readonly heureFermeture = computed(() => {
    const jusqua = this.ouverture()?.jusqua;
    return jusqua ? this.format.heure(jusqua) : '';
  });
  protected readonly distance = computed(() => {
    const position = this.position();
    return position ? this.format.distance(distanceMetres(position, this.pharmacie())) : null;
  });
  protected readonly miseAJour = computed(() => {
    const dates = this.stocks().map((s) => new Date(s.declareLe).getTime());
    return dates.length ? this.format.age(Math.max(...dates)) : null;
  });

  constructor() {
    // Le focus suit l'ouverture : le clavier et les lecteurs d'écran arrivent sur la fiche.
    afterRenderEffect(() => {
      this.pharmacie();
      this.titre().nativeElement.focus({ preventScroll: true });
    });
  }

  protected commencerGlissement(evenement: PointerEvent): void {
    this.departGlissement = evenement.clientY;
  }

  protected finirGlissement(evenement: PointerEvent): void {
    if (evenement.clientY - this.departGlissement > GLISSEMENT_FERMETURE) {
      this.fermer.emit();
    }
  }
}
