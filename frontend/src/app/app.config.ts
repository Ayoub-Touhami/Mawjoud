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
import { ALERT_SERVICE } from './core/services/alert.service';
import { AUTH_SERVICE } from './core/services/auth.service';
import { PHARMACIE_API } from './core/services/pharmacie-api';
import { PharmacieApiMock } from './core/services/pharmacie-api.mock';
import { AlertServiceSimule } from './core/simulation/alert.service.simule';
import { AuthServiceSimule } from './core/simulation/auth.service.simule';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    fournirTraduction(),
    provideAppInitializer(() => inject(LangueService).initialiser()),
    { provide: TitleStrategy, useClass: TitreTraduit },
    // Pour brancher le back-end, seules ces trois lignes changeront.
    { provide: PHARMACIE_API, useClass: PharmacieApiMock },
    { provide: AUTH_SERVICE, useExisting: AuthServiceSimule },
    { provide: ALERT_SERVICE, useExisting: AlertServiceSimule },
  ],
};
