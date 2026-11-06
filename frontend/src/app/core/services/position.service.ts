import { Injectable, signal } from '@angular/core';
import { Coordonnees } from '../outils/pharmacie.outils';

export type ErreurPosition = 'refusee' | 'indisponible';

/**
 * Garde la position en mémoire pendant la visite, pour la pastille et les distances.
 * Elle n'est jamais écrite dans le navigateur ni envoyée : elle disparaît au rechargement.
 */
@Injectable({ providedIn: 'root' })
export class PositionService {
  private readonly courante = signal<Coordonnees | null>(null);

  readonly position = this.courante.asReadonly();

  /** À appeler seulement après un appui sur « Ma position » : c'est ici que le navigateur demande. */
  obtenir(): Promise<Coordonnees> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject('indisponible' satisfies ErreurPosition);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
        (erreur) =>
          reject(
            (erreur.code === erreur.PERMISSION_DENIED
              ? 'refusee'
              : 'indisponible') satisfies ErreurPosition,
          ),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    });
  }

  fixer(position: Coordonnees | null): void {
    this.courante.set(position);
  }
}
