import { Injectable, signal } from '@angular/core';

/** Partagé entre l'en-tête et la carte, dont la barre ouvre le menu sur mobile. */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  readonly menuOuvert = signal(false);
}
