import { Routes } from '@angular/router';

export const environment = {
  production: true,
  /** Vraie API (Partie 9e). false : services simulés de core/simulation, sans serveur. */
  utiliserApi: true,
  /** Adresse de l'API (développement : le back-end lancé par « npm run start:dev » dans backend/). */
  apiUrl: '/api',
  /** Bande « données de test » : seulement avec les services simulés. */
  donneesSimulees: false,
  /** Liens de test des e-mails simulés, administrateur de test… : seulement avec les services simulés. */
  outilsSimulation: false,
  /** Fonds de carte : changer de fournisseur ne demande que ces deux adresses, sans clé. */
  carte: {
    tuiles: 'https://tiles.openfreemap.org/planet',
    glyphes: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  },
  /** Aucune page de développement dans le build de production. */
  routesDeveloppement: [] as Routes,
};
