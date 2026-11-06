import { isDevMode } from '@angular/core';
import { provideTransloco, provideTranslocoTranspiler } from '@jsverse/transloco';
import { ChargeurTraductions } from './transloco-loader';
import { TranspileurBidi } from './transpileur-bidi';

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

export function fournirTraductionComplete() {
  return [fournirTraduction(), provideTranslocoTranspiler(TranspileurBidi)];
}
