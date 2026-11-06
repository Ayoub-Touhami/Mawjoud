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
import { fournirTraductionComplete } from './core/i18n/traduction.config';
import { fournirSimulation } from './core/simulation/fournir-simulation';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    fournirTraductionComplete(),
    provideAppInitializer(() => inject(LangueService).initialiser()),
    { provide: TitleStrategy, useClass: TitreTraduit },
    fournirSimulation(),
  ],
};
