import { ChangeDetectionStrategy, Component, model, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Justificatif } from '../../core/models';
import { Champ, Controle } from '../../shared/champ/champ';

const TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const TAILLE_MAXIMALE = 5 * 1024 * 1024;

/**
 * Justificatif facultatif : la méthode de vérification n'est pas décidée, donc rien n'est imposé.
 * Le contenu du fichier reste dans le navigateur : seuls son nom et sa taille sont transmis.
 */
@Component({
  selector: 'app-champ-justificatif',
  imports: [Champ, Controle, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-champ
      [libelle]="'pharmacien.justificatif.texte' | transloco"
      [aide]="'pharmacien.justificatif.texteAide' | transloco"
    >
      <textarea appControle rows="3" (input)="changerTexte($any($event.target).value)"></textarea>
    </app-champ>
    <app-champ
      [libelle]="'pharmacien.justificatif.fichier' | transloco"
      [aide]="'pharmacien.justificatif.fichierAide' | transloco"
      [erreur]="erreur() ? ('pharmacien.justificatif.' + erreur() | transloco) : ''"
    >
      <input
        appControle
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
        (change)="changerFichier($any($event.target))"
      />
    </app-champ>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--e-3);
    }
  `,
})
export class ChampJustificatif {
  readonly valeur = model<Justificatif>({});

  protected readonly erreur = signal<'type' | 'taille' | null>(null);

  protected changerTexte(texte: string): void {
    this.valeur.update((v) => ({ ...v, texte: texte.trim() || undefined }));
  }

  protected changerFichier(champ: HTMLInputElement): void {
    const fichier = champ.files?.[0];
    const erreur = !fichier
      ? null
      : !TYPES.includes(fichier.type)
        ? 'type'
        : fichier.size > TAILLE_MAXIMALE
          ? 'taille'
          : null;
    this.erreur.set(erreur);
    if (erreur) {
      champ.value = '';
    }
    this.valeur.update((v) => ({
      ...v,
      fichier: fichier && !erreur ? { nom: fichier.name, taille: fichier.size } : undefined,
    }));
  }
}
