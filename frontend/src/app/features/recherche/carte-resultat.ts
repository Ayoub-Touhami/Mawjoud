import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { FormatService } from '../../core/i18n/format.service';
import { FraicheurService } from '../../core/services/fraicheur.service';
import { Icone } from '../../shared/icone/icone';
import { MarqueurPharmacie } from '../../shared/marqueur-pharmacie/marqueur-pharmacie';
import { PastilleStatut } from '../../shared/pastille-statut/pastille-statut';
import { LigneResultat } from './resultats.outils';

/** Une pharmacie dans la liste : déclarée, sans déclaration, ou non inscrite. */
@Component({
  selector: 'app-carte-resultat',
  imports: [Icone, MarqueurPharmacie, PastilleStatut, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      [class.pointilles]="pointilles()"
      [class.grise]="type() === 'non-inscrite'"
      [class.active]="active()"
      [attr.aria-pressed]="active()"
      (click)="choisir.emit()"
    >
      @if (type() === 'non-inscrite') {
        <span class="signe" aria-hidden="true"><app-marqueur-pharmacie [inscrite]="false" /></span>
      }
      <span class="contenu">
        <span class="ligne">
          <strong>{{ ligne().pharmacie.nom }}</strong>
          @if (distance(); as valeur) {
            <span class="distance">{{ valeur }}</span>
          }
        </span>
        @if (ligne().statut; as statut) {
          <span class="ligne">
            <app-pastille-statut [statut]="statut" />
            <span class="age">
              @if (statut !== 'a-confirmer') {
                <app-icone nom="horloge" [taille]="18" />
              }
              {{ age() }}
            </span>
          </span>
        } @else {
          <span class="texte">
            {{
              (type() === 'non-inscrite' ? 'fiche.stockInconnu' : 'fiche.nonDeclare') | transloco
            }}
          </span>
        }
      </span>
    </button>
  `,
  styles: `
    button {
      display: flex;
      gap: var(--e-3);
      inline-size: 100%;
      padding: var(--e-3) var(--e-4);
      font: inherit;
      color: var(--texte);
      text-align: start;
      cursor: pointer;
      background: var(--carte);
      border: 2px solid var(--carte-bord);
      border-radius: var(--rayon);
    }

    button:hover {
      border-color: var(--champ-bord);
    }

    .pointilles {
      background: var(--statut-confirmer-fond);
      border: 2px dashed var(--statut-tirets);
    }

    .grise {
      background: var(--carte-inconnue);
    }

    .active {
      border: 2px solid var(--contour);
    }

    .signe {
      flex-shrink: 0;
      align-self: center;
    }

    app-marqueur-pharmacie {
      inline-size: 24px;
      block-size: 30px;
    }

    .contenu {
      display: grid;
      flex: 1;
      gap: var(--e-2);
      min-inline-size: 0;
    }

    .ligne {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--e-1) var(--e-3);
    }

    strong {
      min-inline-size: 0;
      font-family: var(--police-titre);
      font-size: 17px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }

    .distance {
      font-size: 14px;
      font-weight: 600;
      color: var(--texte-secondaire);
      unicode-bidi: isolate;
    }

    .age {
      display: inline-flex;
      align-items: center;
      gap: var(--e-1);
      font-size: 14px;
      color: var(--texte-secondaire);
    }

    .texte {
      font-size: 15px;
      color: var(--texte);
    }
  `,
})
export class CarteResultat {
  readonly ligne = input.required<LigneResultat>();
  readonly type = input.required<'declaree' | 'non-declaree' | 'non-inscrite'>();
  readonly active = input(false);
  readonly choisir = output<void>();

  private readonly format = inject(FormatService);
  private readonly fraicheur = inject(FraicheurService);

  protected readonly pointilles = computed(
    () => this.type() === 'non-inscrite' || this.ligne().statut === 'a-confirmer',
  );
  protected readonly distance = computed(() => {
    const metres = this.ligne().distance;
    return metres === null ? null : this.format.distance(metres);
  });
  protected readonly age = computed(() => {
    const { stock } = this.ligne();
    return stock ? this.fraicheur.lire(stock).detail : '';
  });
}
