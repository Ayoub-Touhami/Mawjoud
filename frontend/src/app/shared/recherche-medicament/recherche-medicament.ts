import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, debounceTime, map, of, switchMap } from 'rxjs';
import { Medicament } from '../../core/models';
import {
  contientArabe,
  libelleMedicament,
  LONGUEUR_MINIMALE,
  normaliser,
} from '../../core/outils/recherche.outils';
import { PHARMACIE_API } from '../../core/services/pharmacie-api';
import { Icone } from '../icone/icone';

const ATTENTE_FRAPPE_MS = 120;
const SUGGESTIONS_MAX = 7;

/**
 * Champ de recherche avec suggestions (motif ARIA « combobox »). Rien de ce qui est saisi
 * n'est enregistré : le médicament choisi va seulement dans l'adresse de la page de résultats.
 */
@Component({
  selector: 'app-recherche-medicament',
  imports: [Icone, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recherche-medicament.html',
  styleUrl: './recherche-medicament.scss',
})
export class RechercheMedicament {
  /** Texte affiché à l'arrivée sur la page, par exemple le médicament déjà choisi. */
  readonly valeur = input('');

  private readonly api = inject(PHARMACIE_API);
  private readonly router = inject(Router);

  protected readonly texte = signal('');
  protected readonly ouvert = signal(false);
  protected readonly active = signal(-1);
  protected readonly aide = signal(false);
  protected readonly libelle = libelleMedicament;

  private readonly reponse = toSignal(
    toObservable(this.texte).pipe(
      debounceTime(ATTENTE_FRAPPE_MS),
      switchMap((texte) =>
        (normaliser(texte).length < LONGUEUR_MINIMALE
          ? of<Medicament[]>([])
          : this.api.chercherMedicaments(texte).pipe(catchError(() => of<Medicament[]>([])))
        ).pipe(map((medicaments) => ({ texte, medicaments }))),
      ),
    ),
    { initialValue: { texte: '', medicaments: [] as Medicament[] } },
  );
  /** Une réponse à une saisie précédente n'est jamais montrée : Entrée la choisirait à tort. */
  private readonly aJour = computed(() => this.reponse().texte === this.texte());
  protected readonly visibles = computed(() =>
    this.aJour() ? this.reponse().medicaments.slice(0, SUGGESTIONS_MAX) : [],
  );
  protected readonly assezLong = computed(
    () => normaliser(this.texte()).length >= LONGUEUR_MINIMALE,
  );
  protected readonly panneau = computed(() => this.ouvert() && this.assezLong());
  protected readonly sansSuggestion = computed(
    () => this.panneau() && this.aJour() && !this.visibles().length,
  );
  protected readonly lettresArabes = computed(() => contientArabe(this.texte()));
  protected readonly idActive = computed(() =>
    this.panneau() && this.active() >= 0 ? `suggestion-${this.active()}` : null,
  );

  constructor() {
    effect(() => this.texte.set(this.valeur()));
  }

  protected saisir(valeur: string): void {
    this.texte.set(valeur);
    this.ouvert.set(true);
    this.active.set(-1);
    this.aide.set(false);
  }

  protected effacer(champ: HTMLInputElement): void {
    this.saisir('');
    champ.focus();
  }

  protected touche(evenement: KeyboardEvent): void {
    const nombre = this.visibles().length;
    if (evenement.key === 'ArrowDown' || evenement.key === 'ArrowUp') {
      evenement.preventDefault();
      if (nombre) {
        const pas = evenement.key === 'ArrowDown' ? 1 : -1;
        this.ouvert.set(true);
        this.active.update((i) => (i + pas + nombre + (i < 0 && pas < 0 ? 1 : 0)) % nombre);
      }
    } else if (evenement.key === 'Escape' && this.panneau()) {
      evenement.stopPropagation();
      this.ouvert.set(false);
      this.active.set(-1);
    }
  }

  protected valider(evenement: Event): void {
    evenement.preventDefault();
    const choisi = this.visibles()[this.active()];
    if (this.panneau() && choisi) {
      this.choisir(choisi);
    } else if (!this.assezLong()) {
      this.aide.set(true);
    } else {
      this.ouvert.set(false);
      void this.router.navigate(['/resultats'], {
        queryParams: { q: this.texte().trim(), m: null },
        queryParamsHandling: 'merge',
      });
    }
  }

  protected choisir(medicament: Medicament): void {
    this.texte.set(libelleMedicament(medicament));
    this.ouvert.set(false);
    this.active.set(-1);
    void this.router.navigate(['/resultats'], {
      queryParams: { m: medicament.id, q: null },
      queryParamsHandling: 'merge',
    });
  }
}
