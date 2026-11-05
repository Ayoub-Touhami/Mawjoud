import { importProvidersFrom } from '@angular/core';
import { TranslocoTestingModule } from '@jsverse/transloco';
import ar from '../../../i18n/ar.json';
import fr from '../../../i18n/fr.json';

/** Fournit les vrais textes aux tests, sans chargement asynchrone. */
export function fournirTraductionTest() {
  return importProvidersFrom(
    TranslocoTestingModule.forRoot({
      langs: { fr, ar },
      translocoConfig: { availableLangs: ['fr', 'ar'], defaultLang: 'fr' },
      preloadLangs: true,
    }),
  );
}
