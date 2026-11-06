import { Routes } from '@angular/router';

export const environment = {
  production: false,
  /**
   * Désactivées avec `ng serve` : la connexion n'existe pas encore, et toutes les pages
   * doivent rester ouvrables. Elles sont actives dans le build de production.
   */
  gardesActives: false,
  /** Montre les liens de test des e-mails simulés. */
  outilsSimulation: true,
  /** Fonds de carte : changer de fournisseur ne demande que ces deux adresses, sans clé. */
  carte: {
    tuiles: 'https://tiles.openfreemap.org/planet',
    glyphes: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  },
  /** Page de démonstration des composants, absente du plan du site. */
  routesDeveloppement: [
    {
      path: 'design',
      title: 'pages.design',
      loadComponent: () =>
        import('../app/features/design/design.page').then((m) => m.DesignPage),
    },
    {
      path: 'apercu-email',
      title: 'pages.apercuEmail',
      loadComponent: () =>
        import('../app/features/apercu-email/apercu-email.page').then((m) => m.ApercuEmailPage),
    },
  ] as Routes,
};
