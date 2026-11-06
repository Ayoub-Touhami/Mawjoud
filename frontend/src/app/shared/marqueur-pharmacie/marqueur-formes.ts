/** Tracés du marqueur, partagés par le composant et par les images dessinées sur la carte. */
export const CONTOUR_MARQUEUR =
  'M32 78c-1.3 0-2.4-.6-3.4-1.8C15.6 60.4 8 48 8 32a24 24 0 0 1 48 0c0 16-7.6 28.4-20.6 44.2-1 1.2-2.1 1.8-3.4 1.8z';
export const COCHE_MARQUEUR = 'M20 33l9 9 16-18';
export const QUESTION_MARQUEUR = 'M24 26a8 8 0 1 1 12 7c-2.500 1.400-4 3.200-4 6';

export interface CouleursMarqueur {
  plein: string;
  signe: string;
  vide: string;
  tirets: string;
  inconnu: string;
}

/** Contenu SVG d'un marqueur, dans le repère 64 × 80 du composant. */
export function dessinMarqueur(inscrite: boolean, c: CouleursMarqueur): string {
  return inscrite
    ? `<path fill="${c.plein}" d="${CONTOUR_MARQUEUR}"/>
       <path fill="none" stroke="${c.signe}" stroke-width="6" stroke-linecap="round"
         stroke-linejoin="round" d="${COCHE_MARQUEUR}"/>`
    : `<path fill="${c.vide}" stroke="${c.tirets}" stroke-width="3" stroke-dasharray="6 5"
         d="${CONTOUR_MARQUEUR}"/>
       <path fill="none" stroke="${c.inconnu}" stroke-width="4.500" stroke-linecap="round"
         d="${QUESTION_MARQUEUR}"/>
       <circle fill="${c.inconnu}" cx="32" cy="47" r="2.500"/>`;
}
