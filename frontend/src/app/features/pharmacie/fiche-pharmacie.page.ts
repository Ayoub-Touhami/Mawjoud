import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { map, of, switchMap } from 'rxjs';
import { FormatService } from '../../core/i18n/format.service';
import { LangueService } from '../../core/i18n/langue.service';
import { Pharmacie, statutStock, Stock } from '../../core/models';
import {
  distanceMetres,
  estInscrite,
  etatOuverture,
  telephoneLisible,
} from '../../core/outils/pharmacie.outils';
import { libelleMedicament } from '../../core/outils/recherche.outils';
import { PHARMACIE_API } from '../../core/services/pharmacie-api';
import { PositionService } from '../../core/services/position.service';
import { ActionsPharmacie } from '../../shared/actions-pharmacie/actions-pharmacie';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { MessageEtat } from '../../shared/message-etat/message-etat';
import { PastilleStatut } from '../../shared/pastille-statut/pastille-statut';
import { MiniCarte } from './mini-carte';

@Component({
  selector: 'app-fiche-pharmacie-page',
  imports: [
    ActionsPharmacie,
    Bouton,
    Icone,
    MessageEtat,
    MiniCarte,
    PastilleStatut,
    RouterLink,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fiche-pharmacie.page.html',
  styleUrl: './fiche-pharmacie.page.scss',
})
export class FichePharmaciePage {
  private readonly api = inject(PHARMACIE_API);
  private readonly format = inject(FormatService);
  private readonly transloco = inject(TranslocoService);
  private readonly langue = inject(LangueService).langue;
  private readonly position = inject(PositionService).position;

  protected readonly pharmacie = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      switchMap((params) => this.api.obtenirPharmacie(params.get('id') ?? '')),
    ),
  );
  private readonly stocks = toSignal(
    toObservable(this.pharmacie).pipe(
      switchMap((p) => (p ? this.api.stocksDePharmacie(p.id) : of<Stock[]>([]))),
    ),
    { initialValue: [] },
  );
  private readonly medicaments = toSignal(
    this.api.listerMedicaments().pipe(map((liste) => new Map(liste.map((m) => [m.id, m])))),
  );

  protected readonly inscrite = computed(() => {
    const pharmacie = this.pharmacie();
    return !!pharmacie && estInscrite(pharmacie);
  });
  protected readonly telephone = computed(() =>
    telephoneLisible(this.pharmacie()?.telephone ?? ''),
  );
  protected readonly ouverture = computed(() => etatOuverture(this.pharmacie()?.horaires ?? []));
  protected readonly heureFermeture = computed(() => {
    const jusqua = this.ouverture()?.jusqua;
    return jusqua ? this.format.heure(jusqua) : '';
  });
  protected readonly plages = computed(() => this.format.plages(this.pharmacie()?.horaires ?? []));
  protected readonly distance = computed(() => {
    const position = this.position();
    const pharmacie = this.pharmacie();
    return position && pharmacie ? this.format.distance(distanceMetres(position, pharmacie)) : null;
  });
  protected readonly lignesStock = computed(() => {
    this.langue();
    return this.stocks().map((stock) => this.ligne(stock));
  });

  private ligne(stock: Stock) {
    const statut = statutStock(stock);
    const medicament = this.medicaments()?.get(stock.medicamentId);
    const age = this.format.age(stock.declareLe);
    return {
      id: stock.medicamentId,
      nom: medicament ? libelleMedicament(medicament) : stock.medicamentId,
      statut,
      // Après 24 h, le statut déclaré reste lisible à côté de « À confirmer ».
      detail:
        statut === 'a-confirmer'
          ? this.transloco.translate('fiche.dernierAvis', {
              age,
              statut: this.transloco.translate(`statut.${stock.statutDeclare}`).toLocaleLowerCase(),
            })
          : age,
    };
  }

  protected titreCarte(pharmacie: Pharmacie): string {
    return this.transloco.translate('fiche.carte', { nom: pharmacie.nom });
  }
}
