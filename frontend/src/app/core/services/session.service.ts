import { computed, Injectable, signal } from '@angular/core';
import { Role, Utilisateur } from '../models';

/** Garde en mémoire l'utilisateur connecté. */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly courant = signal<Utilisateur | null>(null);

  readonly utilisateur = this.courant.asReadonly();
  readonly connecte = computed(() => this.courant() !== null);

  ouvrir(utilisateur: Utilisateur): void {
    this.courant.set(utilisateur);
  }

  fermer(): void {
    this.courant.set(null);
  }

  aLeRole(roles: Role[]): boolean {
    const utilisateur = this.courant();
    return utilisateur !== null && roles.includes(utilisateur.role);
  }
}
