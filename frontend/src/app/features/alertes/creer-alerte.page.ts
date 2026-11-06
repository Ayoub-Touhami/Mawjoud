import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map, of, switchMap } from 'rxjs';
import { libelleMedicament } from '../../core/outils/recherche.outils';
import { PHARMACIE_API } from '../../core/services/pharmacie-api';

/** La création elle-même arrive avec les comptes : ici, le médicament est seulement conservé. */
@Component({
  selector: 'app-creer-alerte-page',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h1>{{ 'pages.creerAlerte' | transloco }}</h1>
    @if (medicament(); as nom) {
      <p>{{ 'recherche.alerte.choisi' | transloco: { nom: nom } }}</p>
    }
  `,
})
export class CreerAlertePage {
  private readonly api = inject(PHARMACIE_API);

  protected readonly medicament = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(
      switchMap((params) => {
        const id = params.get('m');
        return id
          ? this.api
              .obtenirMedicament(id)
              .pipe(map((medicament) => (medicament ? libelleMedicament(medicament) : null)))
          : of(params.get('q'));
      }),
    ),
  );
}
