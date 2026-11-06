import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { NavigationService } from './core/services/navigation.service';
import { EnTete } from './layout/en-tete/en-tete';
import { PiedDePage } from './layout/pied-de-page/pied-de-page';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, EnTete, PiedDePage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: {
    '[class.sur-carte]': 'surCarte()',
    '[class.sur-resultats]': 'surResultats()',
    '[class.menu-ouvert]': 'menuOuvert()',
  },
})
export class App {
  private readonly adresse = toSignal(
    inject(Router).events.pipe(
      filter((evenement) => evenement instanceof NavigationEnd),
      map((evenement) => evenement.urlAfterRedirects),
    ),
    { initialValue: inject(Location).path() },
  );

  protected readonly menuOuvert = inject(NavigationService).menuOuvert;
  private readonly chemin = computed(() => this.adresse().split('?')[0]);
  protected readonly surResultats = computed(() => this.chemin() === '/resultats');
  /** L'accueil et les résultats sont des cartes plein écran : toute la hauteur est occupée. */
  protected readonly surCarte = computed(
    () => ['', '/'].includes(this.chemin()) || this.surResultats(),
  );
}
