import { Injectable } from '@angular/core';
import { DefaultTranspiler, TranspileParams } from '@jsverse/transloco';

const DEBUT_ISOLATION = '⁨';
const FIN_ISOLATION = '⁩';

/**
 * Dans une phrase arabe, un nom latin, un e-mail ou un dosage peut déplacer la ponctuation
 * voisine. Chaque valeur insérée est donc isolée du texte qui l'entoure.
 */
@Injectable()
export class TranspileurBidi extends DefaultTranspiler {
  override transpile(parametres: TranspileParams): unknown {
    const { value, params } = parametres;
    if (typeof value !== 'string' || !params || !/\p{Script=Arabic}/u.test(value)) {
      return super.transpile(parametres);
    }
    const isoles = Object.fromEntries(
      Object.entries(params).map(([cle, valeur]) => [
        cle,
        `${DEBUT_ISOLATION}${String(valeur)}${FIN_ISOLATION}`,
      ]),
    );
    return super.transpile({ ...parametres, params: isoles });
  }
}
