import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter, TitleStrategy } from '@angular/router';
import { environment } from '../environments/environment';
import { intercepteurApi } from './core/api/api';
import { fournirApi } from './core/api/fournir-api';
import { AuthServiceHttp } from './core/api/services-api';
import { firstValueFrom } from 'rxjs';
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
    provideHttpClient(withInterceptors([intercepteurApi])),
    // Vraie API : la session ouverte (cookie) est reprise avant le premier écran.
    ...(environment.utiliserApi
      ? [fournirApi(), provideAppInitializer(() => firstValueFrom(inject(AuthServiceHttp).restaurer()))]
      : [fournirSimulation()]),
    { provide: TitleStrategy, useClass: TitreTraduit },
  ],
};
