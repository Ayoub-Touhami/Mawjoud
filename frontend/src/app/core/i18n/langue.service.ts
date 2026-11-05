import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Langue, LANGUES } from './traduction.config';

const CLE = 'mawjoud.langue';

@Injectable({ providedIn: 'root' })
export class LangueService {
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private readonly courante = signal<Langue>('fr');

  readonly langue = this.courante.asReadonly();

  /** Charge la langue avant le premier affichage, pour ne jamais montrer une clé brute. */
  async initialiser(): Promise<void> {
    await this.appliquer(this.lireChoix());
  }

  async basculer(): Promise<void> {
    const suivante: Langue = this.courante() === 'fr' ? 'ar' : 'fr';
    await this.appliquer(suivante);
    try {
      localStorage.setItem(CLE, suivante);
    } catch {
      // Stockage indisponible : la langue reste valable pour cette visite.
    }
  }

  private async appliquer(langue: Langue): Promise<void> {
    await firstValueFrom(this.transloco.load(langue));
    this.transloco.setActiveLang(langue);
    this.courante.set(langue);
    const racine = this.document.documentElement;
    racine.lang = langue;
    racine.dir = langue === 'ar' ? 'rtl' : 'ltr';
  }

  private lireChoix(): Langue {
    try {
      const choix = localStorage.getItem(CLE);
      return LANGUES.find((l) => l === choix) ?? 'fr';
    } catch {
      return 'fr';
    }
  }
}
