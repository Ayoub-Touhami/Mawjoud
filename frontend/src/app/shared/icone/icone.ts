import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { ICONES, NomIcone } from './icones';

/** Affiche une icône en ligne : elle prend la couleur du texte qui l'entoure. */
@Component({
  selector: 'app-icone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '',
  styles: `
    :host {
      display: inline-block;
      flex: none;
      inline-size: var(--taille-icone);
      block-size: var(--taille-icone);
    }
  `,
  host: {
    '[innerHTML]': 'contenu()',
    '[style.--taille-icone.px]': 'taille()',
    '[attr.data-miroir]': 'miroir() ? "" : null',
    '[attr.role]': 'libelle() ? "img" : null',
    '[attr.aria-label]': 'libelle() || null',
    '[attr.aria-hidden]': 'libelle() ? null : "true"',
  },
})
export class Icone {
  private readonly assainisseur = inject(DomSanitizer);

  readonly nom = input.required<NomIcone>();
  readonly taille = input(24);
  /** À renseigner quand l'icône est seule et porte le sens. */
  readonly libelle = input('');
  /** Retourne l'icône en arabe (flèches). */
  readonly miroir = input(false);

  // Sans risque : le contenu vient uniquement des fichiers du projet, choisis par un nom typé.
  // Le nettoyage automatique d'Angular supprimerait le <svg>.
  protected readonly contenu = computed(() =>
    this.assainisseur.bypassSecurityTrustHtml(ICONES[this.nom()]),
  );
}
