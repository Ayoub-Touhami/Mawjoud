import {
  ChangeDetectionStrategy,
  Component,
  computed,
  Directive,
  inject,
  input,
} from '@angular/core';
import { Icone } from '../icone/icone';
import { NomIcone } from '../icone/icones';

let compteur = 0;

/** Champ de formulaire : <app-champ libelle="…"><input appControle /></app-champ>. */
@Component({
  selector: 'app-champ',
  imports: [Icone],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './champ.html',
  styleUrl: './champ.scss',
})
export class Champ {
  readonly libelle = input.required<string>();
  readonly aide = input('');
  readonly erreur = input('');
  readonly icone = input<NomIcone>();
  /** Affiche la flèche d'une liste déroulante. */
  readonly liste = input(false);

  readonly id = `champ-${++compteur}`;
  readonly idAide = `${this.id}-aide`;
  readonly idErreur = `${this.id}-erreur`;

  readonly decrit = computed(
    () =>
      [this.erreur() ? this.idErreur : '', this.aide() ? this.idAide : '']
        .filter(Boolean)
        .join(' ') || null,
  );
}

/** Relie un <input>, <select> ou <textarea> à son libellé et à ses messages. */
@Directive({
  selector: 'input[appControle], select[appControle], textarea[appControle]',
  host: {
    class: 'controle',
    '[id]': 'champ.id',
    '[attr.aria-describedby]': 'champ.decrit()',
    '[attr.aria-invalid]': 'champ.erreur() ? "true" : null',
  },
})
export class Controle {
  protected readonly champ = inject(Champ);
}
