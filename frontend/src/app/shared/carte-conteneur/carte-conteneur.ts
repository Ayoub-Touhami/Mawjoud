import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Conteneur de la charte. « pointilles » : fond grisé et tirets, pour ce qui reste inconnu. */
@Component({
  selector: 'app-carte-conteneur',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  styles: `
    :host {
      display: block;
      padding: var(--e-4);
      background: var(--carte);
      border: 1px solid var(--carte-bord);
      border-radius: var(--rayon);
      box-shadow: var(--ombre-carte);
    }

    :host(.pointilles) {
      background: var(--carte-inconnue);
      border: 1.5px dashed var(--statut-tirets);
      box-shadow: none;
    }

    :host(.selectionnee) {
      border: 2px solid var(--contour);
    }
  `,
  host: { '[class.pointilles]': 'pointilles()', '[class.selectionnee]': 'selectionnee()' },
})
export class CarteConteneur {
  readonly pointilles = input(false);
  readonly selectionnee = input(false);
}
