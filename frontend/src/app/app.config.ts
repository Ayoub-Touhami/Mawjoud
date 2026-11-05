import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, TitleStrategy } from '@angular/router';
import { routes } from './app.routes';
import { LangueService } from './core/i18n/langue.service';
import { TitreTraduit } from './core/i18n/titre-traduit';
import { fournirTraduction } from './core/i18n/traduction.config';
import { PHARMACIE_API } from './core/services/pharmacie-api';
import { PharmacieApiMock } from './core/services/pharmacie-api.mock';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    fournirTraduction(),
    provideAppInitializer(() => inject(LangueService).initialiser()),
    { provide: TitleStrategy, useClass: TitreTraduit },
    // Pour brancher le back-end, seule cette ligne changera.
    { provide: PHARMACIE_API, useClass: PharmacieApiMock },
  ],
};
