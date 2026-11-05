import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatutStock } from '../../core/models';
import { Icone } from '../icone/icone';
import { NomIcone } from '../icone/icones';

export type Pastille = StatutStock | 'non-inscrite' | 'inscrite-verifiee';

const SIGNES: Record<Pastille, NomIcone> = {
  disponible: 'coche',
  'quantite-limitee': 'moins',
  'en-rupture': 'fermer',
  'a-confirmer': 'horloge',
  'non-inscrite': 'question',
  'inscrite-verifiee': 'verifiee',
};

/** Un statut est toujours un mot et un signe, jamais la couleur seule (R15). */
@Component({
  selector: 'app-pastille-statut',
  imports: [Icone, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-icone [nom]="signe()" [taille]="18" />
    <span>{{ 'statut.' + statut() | transloco }}</span>
  `,
  styleUrl: './pastille-statut.scss',
  host: { '[class]': 'statut()' },
})
export class PastilleStatut {
  readonly statut = input.required<Pastille>();
  protected readonly signe = computed(() => SIGNES[this.statut()]);
}
