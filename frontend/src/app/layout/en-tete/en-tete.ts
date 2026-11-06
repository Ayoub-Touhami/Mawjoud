import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { NavigationService } from '../../core/services/navigation.service';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { Logo } from '../../shared/logo/logo';
import { SelecteurLangue } from '../selecteur-langue/selecteur-langue';
import { SelecteurTheme } from '../selecteur-theme/selecteur-theme';

@Component({
  selector: 'app-en-tete',
  imports: [
    Bouton,
    Icone,
    Logo,
    RouterLink,
    RouterLinkActive,
    SelecteurLangue,
    SelecteurTheme,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './en-tete.html',
  styleUrl: './en-tete.scss',
  host: { '(document:keydown.escape)': 'fermer()' },
})
export class EnTete {
  protected readonly ouvert = inject(NavigationService).menuOuvert;
  private readonly boutonMenu = viewChild.required<ElementRef<HTMLElement>>('boutonMenu');

  constructor() {
    inject(Router)
      .events.pipe(
        filter((evenement) => evenement instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.fermer());
    // La carte peut ouvrir le menu : le focus rejoint alors le bouton de fermeture.
    afterRenderEffect(() => {
      if (this.ouvert()) {
        this.boutonMenu().nativeElement.focus();
      }
    });
  }

  protected basculer(): void {
    this.ouvert.update((valeur) => !valeur);
  }

  protected fermer(): void {
    this.ouvert.set(false);
  }
}
