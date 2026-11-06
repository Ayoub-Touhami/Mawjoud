import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ConnexionService {
  private readonly etat = signal(navigator.onLine);

  readonly enLigne = this.etat.asReadonly();

  constructor() {
    window.addEventListener('online', () => this.verifier());
    window.addEventListener('offline', () => this.verifier());
  }

  verifier(): void {
    this.etat.set(navigator.onLine);
  }
}
