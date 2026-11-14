import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Icone } from '../../shared/icone/icone';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { AUTH_SERVICE } from '../../core/services/auth.service';

@Component({
  selector: 'app-pied-de-page',
  imports: [Icone, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pied-de-page.html',
  styleUrl: './pied-de-page.scss',
})
export class PiedDePage {
  private readonly compte = inject(AUTH_SERVICE).utilisateur;

  /** Le lien ne se montre qu'à l'administrateur : les autres n'ont rien à y faire. */
  protected readonly administrateur = computed(() => this.compte()?.role === 'administrateur');
}
