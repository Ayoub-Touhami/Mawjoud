import { isDevMode } from '@angular/core';
import { provideTransloco } from '@jsverse/transloco';
import { ChargeurTraductions } from './transloco-loader';

export const LANGUES = ['fr', 'ar'] as const;
export type Langue = (typeof LANGUES)[number];

export function fournirTraduction() {
  return provideTransloco({
    config: {
      availableLangs: [...LANGUES],
      defaultLang: 'fr',
      fallbackLang: 'fr',
      reRenderOnLangChange: true,
      prodMode: !isDevMode(),
      missingHandler: { useFallbackTranslation: true },
    },
    loader: ChargeurTraductions,
  });
}
