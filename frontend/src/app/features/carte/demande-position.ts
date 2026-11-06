import { inject, Injectable, signal } from '@angular/core';
import { Coordonnees } from '../../core/outils/pharmacie.outils';
import { ErreurPosition, PositionService } from '../../core/services/position.service';
import { dansTunisie } from './cadrage';

export type MessagePosition = 'pourquoi' | ErreurPosition | 'horsTunisie';

/** Parcours de « Ma position », commun à la carte et aux résultats. */
@Injectable()
export class DemandePosition {
  private readonly positions = inject(PositionService);
  private accord = false;

  readonly message = signal<MessagePosition | null>(null);
  readonly enCours = signal(false);
  /** Appelé quand une position en Tunisie est connue, pour recentrer la carte. */
  auSucces: (position: Coordonnees) => void = () => undefined;

  demander(): void {
    if (this.accord) {
      void this.localiser();
    } else {
      this.message.set('pourquoi');
    }
  }

  accepter(): void {
    this.accord = true;
    void this.localiser();
  }

  private async localiser(): Promise<void> {
    this.message.set(null);
    this.enCours.set(true);
    try {
      const position = await this.positions.obtenir();
      if (dansTunisie(position)) {
        this.positions.fixer(position);
        this.auSucces(position);
      } else {
        this.positions.fixer(null);
        this.message.set('horsTunisie');
      }
    } catch (erreur) {
      this.message.set(erreur as ErreurPosition);
    } finally {
      this.enCours.set(false);
    }
  }
}
