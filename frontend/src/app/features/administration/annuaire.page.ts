import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { GOUVERNORATS } from '../../core/gouvernorats';
import { normaliser } from '../../core/outils/recherche.outils';
import { Bouton } from '../../shared/bouton/bouton';
import { Champ, Controle } from '../../shared/champ/champ';
import { PastilleStatut } from '../../shared/pastille-statut/pastille-statut';
import { ADMIN_DIRECTORY_SERVICE } from './services/admin.contrats';

const PAS = 50;

@Component({
  selector: 'app-annuaire-page',
  imports: [Bouton, Champ, Controle, PastilleStatut, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './annuaire.page.html',
  styleUrls: ['./admin-partage.scss', './annuaire.page.scss'],
})
export class AnnuairePage {
  private readonly fiches = toSignal(inject(ADMIN_DIRECTORY_SERVICE).listerFiches(), {
    initialValue: [],
  });

  protected readonly gouvernorats = GOUVERNORATS;
  protected readonly texte = signal('');
  protected readonly gouvernorat = signal('');
  protected readonly ville = signal('');
  protected readonly inscription = signal('');
  protected readonly doublons = signal(false);
  protected readonly limite = signal(PAS);

  protected readonly villes = computed(() =>
    [...new Set(this.fiches().map((f) => f.ville))].sort((a, b) => a.localeCompare(b)),
  );
  protected readonly filtrees = computed(() => {
    const recherche = normaliser(this.texte());
    return this.fiches().filter(
      (f) =>
        (!recherche || normaliser(`${f.nom} ${f.adresse} ${f.telephone}`).includes(recherche)) &&
        (!this.gouvernorat() || f.gouvernorat === this.gouvernorat()) &&
        (!this.ville() || f.ville === this.ville()) &&
        (!this.inscription() ||
          (this.inscription() === 'inscrite') === (f.etat === 'inscrite')) &&
        (!this.doublons() || f.doublons.length > 0),
    );
  });
  protected readonly visibles = computed(() => this.filtrees().slice(0, this.limite()));

  protected voirPlus(): void {
    this.limite.update((n) => n + PAS);
  }
}
