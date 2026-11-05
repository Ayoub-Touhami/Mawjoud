import { Routes } from '@angular/router';

export const environment = {
  production: false,
  /**
   * Désactivées avec `ng serve` : la connexion n'existe pas encore, et toutes les pages
   * doivent rester ouvrables. Elles sont actives dans le build de production.
   */
  gardesActives: false,
  /** Page de démonstration des composants, absente du plan du site. */
  routesDeveloppement: [
    {
      path: 'design',
      title: 'pages.design',
      loadComponent: () =>
        import('../app/features/design/design.page').then((m) => m.DesignPage),
    },
  ] as Routes,
};
