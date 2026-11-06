import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Bouton } from '../../shared/bouton/bouton';
import { Champ, Controle } from '../../shared/champ/champ';
import { ConfirmationAdmin } from './composants-admin';
import {
  ADMIN_DIRECTORY_SERVICE,
  ChampsFiche,
  ErreurAdmin,
  FicheAnnuaire,
} from './services/admin.contrats';

const CHAMPS = ['nom', 'adresse', 'ville', 'telephone'] as const;
type ChampFusion = (typeof CHAMPS)[number];

/** Fusion avec une fiche probablement identique, champ par champ. */
@Component({
  selector: 'app-fusion-fiches',
  imports: [Bouton, Champ, ConfirmationAdmin, Controle, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panneau">
      <h2>{{ 'admin.fusion.titre' | transloco }}</h2>
      @if (!fiche().doublons.length) {
        <p class="note">{{ 'admin.fusion.aucun' | transloco }}</p>
      } @else {
        <app-champ [liste]="true" [libelle]="'admin.fusion.autre' | transloco">
          <select appControle (change)="choisir($any($event.target).value)">
            <option value="">{{ 'admin.motif.choisir' | transloco }}</option>
            @for (id of fiche().doublons; track id) {
              <option [value]="id">{{ id }}</option>
            }
          </select>
        </app-champ>
      }

      @if (autre(); as a) {
        <fieldset>
          <legend>{{ 'admin.fusion.garder' | transloco }}</legend>
          <label>
            <input
              type="radio"
              name="fiche-gardee"
              [checked]="gardeeCourante()"
              (change)="gardeeCourante.set(true)"
            />
            {{ fiche().nom }} ({{ fiche().id }})
          </label>
          <label>
            <input
              type="radio"
              name="fiche-gardee"
              [checked]="!gardeeCourante()"
              (change)="gardeeCourante.set(false)"
            />
            {{ a.nom }} ({{ a.id }})
          </label>
        </fieldset>

        @for (champ of champs; track champ) {
          <fieldset>
            <legend>{{ 'admin.fiche.' + champ | transloco }}</legend>
            <label>
              <input
                type="radio"
                [name]="'champ-' + champ"
                [checked]="!repris().has(champ)"
                (change)="reprendre(champ, false)"
              />
              {{ gardee()?.[champ] }}
            </label>
            <label>
              <input
                type="radio"
                [name]="'champ-' + champ"
                [checked]="repris().has(champ)"
                (change)="reprendre(champ, true)"
              />
              {{ retiree()?.[champ] }}
            </label>
          </fieldset>
        }

        @if (erreur(); as code) {
          <p class="erreur" role="alert">{{ 'admin.erreurs.' + code | transloco }}</p>
        }

        @if (confirmation()) {
          <app-confirmation-admin
            [texte]="'admin.fusion.confirmer' | transloco: { id: retiree()?.id }"
            [action]="'admin.demandes.confirmerAction' | transloco"
            (confirmer)="fusionner()"
            (annuler)="confirmation.set(false)"
          />
        } @else {
          <button type="button" appBouton variante="secondaire" (click)="confirmation.set(true)">
            {{ 'admin.fusion.action' | transloco }}
          </button>
        }
      }
    </section>
  `,
  styleUrl: './admin-partage.scss',
  styles: `
    fieldset {
      display: grid;
      gap: var(--e-1);
      padding: var(--e-3);
      margin: 0;
      border: 1px solid var(--carte-bord);
      border-radius: var(--rayon-petit);
    }

    legend {
      padding-inline: var(--e-1);
      font-weight: 600;
    }

    label {
      display: flex;
      gap: var(--e-2);
      align-items: center;
      min-block-size: var(--cible-tactile);
      cursor: pointer;
    }
  `,
})
export class FusionFiches {
  readonly fiche = input.required<FicheAnnuaire>();
  readonly fusionnee = output<void>();

  private readonly service = inject(ADMIN_DIRECTORY_SERVICE);
  private readonly router = inject(Router);

  protected readonly champs = CHAMPS;
  protected readonly autre = signal<FicheAnnuaire | null>(null);
  protected readonly gardeeCourante = signal(true);
  protected readonly repris = signal<ReadonlySet<ChampFusion>>(new Set());
  protected readonly confirmation = signal(false);
  protected readonly erreur = signal<ErreurAdmin | null>(null);
  protected readonly gardee = computed(() => (this.gardeeCourante() ? this.fiche() : this.autre()));
  protected readonly retiree = computed(() => (this.gardeeCourante() ? this.autre() : this.fiche()));

  constructor() {
    effect(() => {
      this.gardeeCourante();
      this.repris.set(new Set());
    });
  }

  protected async choisir(id: string): Promise<void> {
    this.autre.set(id ? ((await firstValueFrom(this.service.obtenirFiche(id))) ?? null) : null);
    this.erreur.set(null);
    this.confirmation.set(false);
  }

  protected reprendre(champ: ChampFusion, repris: boolean): void {
    this.repris.update((actuels) => {
      const suite = new Set(actuels);
      if (repris) {
        suite.add(champ);
      } else {
        suite.delete(champ);
      }
      return suite;
    });
  }

  protected async fusionner(): Promise<void> {
    const gardee = this.gardee();
    const retiree = this.retiree();
    if (!gardee || !retiree) {
      return;
    }
    const champs: ChampsFiche = {};
    this.repris().forEach((champ) => {
      champs[champ] = retiree[champ];
    });
    try {
      await firstValueFrom(this.service.fusionner(gardee.id, retiree.id, champs));
      this.autre.set(null);
      this.confirmation.set(false);
      await this.router.navigate(['/admin/annuaire', gardee.id], { replaceUrl: true });
      this.fusionnee.emit();
    } catch (erreur) {
      this.erreur.set(erreur as ErreurAdmin);
      this.confirmation.set(false);
    }
  }
}
