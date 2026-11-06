import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatutDeclare } from '../../core/models';
import { LectureStock } from '../../core/services/fraicheur.service';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { NomIcone } from '../../shared/icone/icones';

const STATUTS: { valeur: StatutDeclare; signe: NomIcone }[] = [
  { valeur: 'disponible', signe: 'coche' },
  { valeur: 'quantite-limitee', signe: 'moins' },
  { valeur: 'en-rupture', signe: 'fermer' },
];

/** Un médicament suivi : un appui sur un statut suffit à le déclarer. */
@Component({
  selector: 'app-ligne-stock',
  imports: [Bouton, Icone, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ligne-stock.html',
  styleUrl: './ligne-stock.scss',
})
export class LigneStock {
  readonly nom = input.required<string>();
  readonly lecture = input.required<LectureStock | null>();
  /** Compte non vérifié : les boutons restent visibles, mais inactifs. */
  readonly desactive = input(false);
  /** Statut que l'échec réseau n'a pas permis d'enregistrer. */
  readonly echec = input<StatutDeclare | null>(null);
  readonly enCours = input(false);

  readonly choisir = output<StatutDeclare>();
  readonly retirer = output<void>();

  protected readonly statuts = STATUTS;
  protected readonly confirmation = signal(false);
}
