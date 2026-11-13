import { Routes } from '@angular/router';

export const environment = {
  production: false,
  /** Vraie API (Partie 9e). false : services simulés de core/simulation, sans serveur. */
  utiliserApi: true,
  /** Adresse de l'API (développement : le back-end lancé par « npm run start:dev » dans backend/). */
  apiUrl: 'http://localhost:3000/api',
  /** Bande « données de test » : seulement avec les services simulés. */
  donneesSimulees: false,
  /** Liens de test des e-mails simulés, administrateur de test… : seulement avec les services simulés. */
  outilsSimulation: false,
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
