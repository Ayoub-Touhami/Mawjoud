import { Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';

/** Les textes sont empaquetés par langue et chargés à la demande. */
const FICHIERS: Record<string, () => Promise<{ default: Translation }>> = {
  fr: () => import('../../../i18n/fr.json'),
  ar: () => import('../../../i18n/ar.json'),
};

@Injectable({ providedIn: 'root' })
export class ChargeurTraductions implements TranslocoLoader {
  async getTranslation(langue: string): Promise<Translation> {
    const module = await FICHIERS[langue]();
    return module.default;
  }
}
