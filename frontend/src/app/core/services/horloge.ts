import { InjectionToken } from '@angular/core';

/** Heure courante, remplaçable dans les tests pour simuler le passage du temps. */
export const HORLOGE = new InjectionToken<() => Date>('HORLOGE', {
  providedIn: 'root',
  factory: () => () => new Date(),
});
