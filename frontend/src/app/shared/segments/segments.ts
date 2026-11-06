import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';

let compteur = 0;

export interface Segment<T extends string> {
  valeur: T;
  libelle: string;
}

/** Choix à deux segments, en boutons radio natifs pour le clavier et les lecteurs d'écran. */
@Component({
  selector: 'app-segments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div role="radiogroup" [attr.aria-label]="libelle()">
      @for (option of options(); track option.valeur) {
        <label [class.actif]="option.valeur === valeur()">
          <input
            type="radio"
            class="visuellement-masque"
            [name]="nom"
            [value]="option.valeur"
            [checked]="option.valeur === valeur()"
            (change)="valeur.set(option.valeur)"
          />
          {{ option.libelle }}
        </label>
      }
    </div>
  `,
  styles: `
    div {
      display: grid;
      grid-auto-columns: minmax(0, 1fr);
      grid-auto-flow: column;
      gap: var(--e-1);
      padding: var(--e-1);
      background: var(--panneau-menthe);
      border-radius: var(--rayon);
    }

    label {
      position: relative;
      display: grid;
      place-items: center;
      min-block-size: var(--cible-tactile);
      padding-inline: var(--e-2);
      font-weight: 600;
      color: var(--titre);
      text-align: center;
      cursor: pointer;
      border-radius: var(--rayon-petit);
    }

    label.actif {
      color: var(--action-texte);
      background: var(--action);
    }

    label:has(:focus-visible) {
      outline: 2px solid var(--focus);
      outline-offset: 2px;
    }
  `,
})
export class Segments<T extends string> {
  readonly options = input.required<Segment<T>[]>();
  readonly libelle = input.required<string>();
  readonly valeur = model.required<T>();

  protected readonly nom = `segments-${++compteur}`;
}
