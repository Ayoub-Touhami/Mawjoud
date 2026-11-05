import { Routes } from '@angular/router';

export const environment = {
  production: true,
  /** Les gardes d'accès aux espaces protégés sont actives. */
  gardesActives: true,
  /** Aucune page de développement dans le build de production. */
  routesDeveloppement: [] as Routes,
};
