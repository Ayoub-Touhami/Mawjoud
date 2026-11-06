import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  Pipe,
  PipeTransform,
  signal,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MotifRefus } from '../../core/models';
import { Bouton } from '../../shared/bouton/bouton';
import { Champ, Controle } from '../../shared/champ/champ';
import { MotifDecision } from './services/admin.contrats';

const DATE_FR = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

@Pipe({ name: 'dateFr' })
export class DateFrPipe implements PipeTransform {
  transform(date: string): string {
    return DATE_FR.format(new Date(date));
  }
}

/** Dit ce qui va se passer avant toute action destructrice ou irréversible. */
@Component({
  selector: 'app-confirmation-admin',
  imports: [Bouton, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="confirmation" role="alertdialog" aria-modal="false" [attr.aria-label]="texte()">
      <p>{{ texte() }}</p>
      <ng-content />
      <div class="boutons">
        <button type="button" appBouton (click)="confirmer.emit()">{{ action() }}</button>
        <button type="button" appBouton variante="secondaire" (click)="annuler.emit()">
          {{ 'carte.position.annuler' | transloco }}
        </button>
      </div>
    </div>
  `,
  styles: `
    .confirmation {
      display: grid;
      gap: var(--e-3);
      padding: var(--e-3) var(--e-4);
      color: var(--texte);
      background: var(--statut-confirmer-fond);
      border: 2px dashed var(--statut-tirets);
      border-radius: var(--rayon);
    }

    p {
      margin-block: 0;
    }

    .boutons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--e-2);
    }
  `,
})
export class ConfirmationAdmin {
  readonly texte = input.required<string>();
  readonly action = input.required<string>();
  readonly confirmer = output<void>();
  readonly annuler = output<void>();

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    // Le focus rejoint la question : le clavier ne reste pas sur le bouton qui l'a ouverte.
    afterNextRender(() => element.querySelector('button')?.focus());
  }
}

const MOTIFS: MotifRefus[] = [
  'justificatif-illisible',
  'informations-incompletes',
  'pharmacie-attribuee',
  'autre',
];

/** Un motif traduit, que le pharmacien lit dans sa langue, et une précision libre. */
@Component({
  selector: 'app-champ-motif',
  imports: [Champ, Controle, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-champ
      [liste]="true"
      [libelle]="'admin.motif.libelle' | transloco"
      [erreur]="erreur() ? ('admin.erreurs.motif-requis' | transloco) : ''"
    >
      <select appControle (change)="choisir($any($event.target).value)">
        <option value="">{{ 'admin.motif.choisir' | transloco }}</option>
        @for (motif of motifs; track motif) {
          <option [value]="motif">{{ 'pharmacien.motifs.' + motif | transloco }}</option>
        }
      </select>
    </app-champ>
    <app-champ
      [libelle]="'admin.motif.precision' | transloco"
      [aide]="'admin.motif.precisionAide' | transloco"
    >
      <textarea appControle rows="2" (input)="preciser($any($event.target).value)"></textarea>
    </app-champ>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--e-3);
    }
  `,
})
export class ChampMotif {
  readonly erreur = input(false);
  readonly motifChoisi = output<MotifDecision | null>();

  protected readonly motifs = MOTIFS;
  private readonly code = signal<MotifRefus | ''>('');
  private readonly precision = signal('');

  protected choisir(code: string): void {
    this.code.set(code as MotifRefus | '');
    this.annoncer();
  }

  protected preciser(precision: string): void {
    this.precision.set(precision);
    this.annoncer();
  }

  private annoncer(): void {
    const code = this.code();
    const precision = this.precision().trim();
    this.motifChoisi.emit(code ? { code, ...(precision ? { precision } : {}) } : null);
  }
}
