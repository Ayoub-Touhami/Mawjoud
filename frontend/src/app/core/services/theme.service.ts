import { DOCUMENT, inject, Injectable, signal } from '@angular/core';

export type Theme = 'clair' | 'sombre';

const CLE = 'mawjoud.theme';

/** Suit le réglage du système tant que l'utilisateur n'a pas choisi lui-même. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly racine = inject(DOCUMENT).documentElement;
  private readonly systeme = window.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly choix = signal<Theme | null>(this.lireChoix());
  private readonly courant = signal<Theme>(this.calculer());

  readonly theme = this.courant.asReadonly();

  constructor() {
    this.systeme?.addEventListener('change', () => this.courant.set(this.calculer()));
  }

  basculer(): void {
    const suivant: Theme = this.courant() === 'clair' ? 'sombre' : 'clair';
    this.choix.set(suivant);
    this.courant.set(suivant);
    this.racine.setAttribute('data-theme', suivant);
    try {
      localStorage.setItem(CLE, suivant);
    } catch {
      // Stockage indisponible : le thème reste valable pour cette visite.
    }
  }

  private calculer(): Theme {
    return this.choix() ?? (this.systeme?.matches ? 'sombre' : 'clair');
  }

  private lireChoix(): Theme | null {
    try {
      const valeur = localStorage.getItem(CLE);
      return valeur === 'clair' || valeur === 'sombre' ? valeur : null;
    } catch {
      return null;
    }
  }
}
