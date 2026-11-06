import { Routes } from '@angular/router';

export const environment = {
  production: true,
  /** Bande « données de test » : à passer à false avec les vraies données. */
  donneesSimulees: true,
  /** Montre les liens de test des e-mails simulés. */
  outilsSimulation: false,
  /** Fonds de carte : changer de fournisseur ne demande que ces deux adresses, sans clé. */
  carte: {
    tuiles: 'https://tiles.openfreemap.org/planet',
    glyphes: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  },
  /** Aucune page de développement dans le build de production. */
  routesDeveloppement: [] as Routes,
};
