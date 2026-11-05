import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { PHARMACIE_API } from './core/services/pharmacie-api';
import { PharmacieApiMock } from './core/services/pharmacie-api.mock';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Pour brancher le back-end, seule cette ligne changera.
    { provide: PHARMACIE_API, useClass: PharmacieApiMock },
  ],
};
