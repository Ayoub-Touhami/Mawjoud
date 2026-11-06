import { Coordonnees } from '../../core/outils/pharmacie.outils';
import paysVoisins from './pays-voisins.json';

/**
 * Rectangle autorisé. Le contour du pays va de 7,48° à 11,56° de longitude et de 30,23° à
 * 37,35° de latitude ; le nord garde de la marge pour l'archipel de la Galite.
 */
export const RECTANGLE_TUNISIE = { ouest: 7.4, sud: 30.2, est: 11.7, nord: 37.6 };

export interface Marges {
  haut: number;
  bas: number;
  gauche: number;
  droite: number;
}

/** Rectangle en coordonnées Mercator, de 0 à 1, et marges d'affichage en pixels. */
export interface Limites {
  zoomMinimal: number;
  marges: Marges;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

/** Taille du monde en pixels au zoom 0 pour MapLibre. */
const MONDE = 512;

function versMercator(longitude: number, latitude: number): { x: number; y: number } {
  const sinus = Math.sin((latitude * Math.PI) / 180);
  return {
    x: (longitude + 180) / 360,
    y: 0.5 - Math.log((1 + sinus) / (1 - sinus)) / (4 * Math.PI),
  };
}

function depuisMercator(x: number, y: number): { longitude: number; latitude: number } {
  return {
    longitude: x * 360 - 180,
    latitude: (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI,
  };
}

/** Zoom auquel le rectangle tient exactement dans la zone libre de l'écran. */
export function calculerLimites(largeur: number, hauteur: number, marges: Marges): Limites {
  const nordOuest = versMercator(RECTANGLE_TUNISIE.ouest, RECTANGLE_TUNISIE.nord);
  const sudEst = versMercator(RECTANGLE_TUNISIE.est, RECTANGLE_TUNISIE.sud);
  const utile = {
    largeur: Math.max(1, largeur - marges.gauche - marges.droite),
    hauteur: Math.max(1, hauteur - marges.haut - marges.bas),
  };
  const zoomMinimal = Math.min(
    Math.log2(utile.largeur / ((sudEst.x - nordOuest.x) * MONDE)),
    Math.log2(utile.hauteur / ((sudEst.y - nordOuest.y) * MONDE)),
  );
  return { zoomMinimal, marges, xMin: nordOuest.x, xMax: sudEst.x, yMin: nordOuest.y, yMax: sudEst.y };
}

/** Les marges restent en pixels : plus on zoome, moins elles couvrent de terrain. */
function zoneAuZoom({ marges, xMin, xMax, yMin, yMax }: Limites, zoom: number) {
  const echelle = MONDE * 2 ** zoom;
  return {
    echelle,
    xMin: xMin - marges.gauche / echelle,
    xMax: xMax + marges.droite / echelle,
    yMin: yMin - marges.haut / echelle,
    yMax: yMax + marges.bas / echelle,
  };
}

export function centreDe(limites: Limites): { longitude: number; latitude: number } {
  const zone = zoneAuZoom(limites, limites.zoomMinimal);
  return depuisMercator((zone.xMin + zone.xMax) / 2, (zone.yMin + zone.yMax) / 2);
}

/** Si l'écran est plus large que la zone sur un axe, la vue reste centrée sur cet axe. */
function borner(valeur: number, min: number, max: number, demiVue: number): number {
  return max - min <= demiVue * 2
    ? (min + max) / 2
    : Math.min(Math.max(valeur, min + demiVue), max - demiVue);
}

/**
 * Remplace maxBounds : MapLibre interdit à l'écran de dépasser les limites, ce qui ferait
 * zoomer jusqu'à couper le pays sur un écran dont la forme diffère de celle de la Tunisie.
 */
export function contraindre(
  limites: Limites,
  largeur: number,
  hauteur: number,
  centre: { longitude: number; latitude: number },
  zoom: number,
): { longitude: number; latitude: number; zoom: number } {
  const zoomRetenu = Math.max(zoom, limites.zoomMinimal);
  const zone = zoneAuZoom(limites, zoomRetenu);
  const { x, y } = versMercator(centre.longitude, centre.latitude);
  return {
    ...depuisMercator(
      borner(x, zone.xMin, zone.xMax, largeur / 2 / zone.echelle),
      borner(y, zone.yMin, zone.yMax, hauteur / 2 / zone.echelle),
    ),
    zoom: zoomRetenu,
  };
}

function dansAnneau(x: number, y: number, anneau: number[][]): boolean {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const [xi, yi] = anneau[i];
    const [xj, yj] = anneau[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      dedans = !dedans;
    }
  }
  return dedans;
}

/**
 * Vrai dans le rectangle, hors des pays voisins. La mer comprise dans le rectangle compte comme
 * la Tunisie : le contour simplifié couperait sinon des points de la côte.
 */
export function dansTunisie({ latitude, longitude }: Coordonnees): boolean {
  const { ouest, sud, est, nord } = RECTANGLE_TUNISIE;
  if (longitude < ouest || longitude > est || latitude < sud || latitude > nord) {
    return false;
  }
  return !paysVoisins.geometry.coordinates.some(([anneau]) =>
    dansAnneau(longitude, latitude, anneau),
  );
}
