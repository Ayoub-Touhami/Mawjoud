import type { Map as CarteMapLibre } from 'maplibre-gl';
import { dessinMarqueur } from '../../shared/marqueur-pharmacie/marqueur-formes';

/** Les images sont dessinées au double de leur taille, pour rester nettes sur téléphone. */
const RATIO = 2;
const MARQUEUR = { largeur: 32, hauteur: 40 };
const SELECTION = { largeur: 80, hauteur: 80 };

interface Couleurs {
  plein: string;
  signe: string;
  vide: string;
  tirets: string;
  inconnu: string;
  halo: string;
  grappe: string;
  grappeTexte: string;
  grappeAnneau: string;
  police: string;
}

/** Les couleurs viennent des jetons de design, pour suivre le thème actif. */
function lireCouleurs(): Couleurs {
  const styles = getComputedStyle(document.documentElement);
  const jeton = (nom: string) => styles.getPropertyValue(nom).trim();
  return {
    plein: jeton('--marqueur-plein'),
    signe: jeton('--marqueur-signe'),
    vide: jeton('--marqueur-vide'),
    tirets: jeton('--statut-tirets'),
    inconnu: jeton('--statut-inconnu'),
    halo: jeton('--marqueur-halo'),
    grappe: jeton('--action'),
    grappeTexte: jeton('--action-texte'),
    grappeAnneau: jeton('--tonal'),
    police: jeton('--police-texte'),
  };
}

function creerToile(taille: number, hauteur = taille): CanvasRenderingContext2D {
  const toile = document.createElement('canvas');
  toile.width = taille;
  toile.height = hauteur;
  return toile.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
}

async function rasteriser(svg: string, largeur: number, hauteur: number): Promise<ImageData> {
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await image.decode();
  const contexte = creerToile(largeur * RATIO, hauteur * RATIO);
  contexte.drawImage(image, 0, 0, largeur * RATIO, hauteur * RATIO);
  return contexte.getImageData(0, 0, largeur * RATIO, hauteur * RATIO);
}

function svgMarqueur(inscrite: boolean, c: Couleurs): string {
  const { largeur, hauteur } = MARQUEUR;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}"
    viewBox="4 0 56 80">${dessinMarqueur(inscrite, c)}</svg>`;
}

/** Halo, ombre au sol et marqueur agrandi, comme sur le marqueur sélectionné du PDF. */
function svgSelection(inscrite: boolean, c: Couleurs): string {
  const { largeur, hauteur } = SELECTION;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}"
    viewBox="0 0 80 80">
    <circle cx="40" cy="38" r="38" fill="${c.halo}"/>
    <ellipse cx="40" cy="69" rx="24" ry="7" fill="${c.halo}"/>
    <svg x="16" y="16" width="48" height="54" viewBox="4 0 56 80"
      preserveAspectRatio="xMidYMid meet">${dessinMarqueur(inscrite, c)}</svg>
  </svg>`;
}

function dessinerGrappe(nombre: number, c: Couleurs): ImageData {
  const diametre = nombre < 10 ? 40 : nombre < 100 ? 46 : 54;
  const taille = diametre * RATIO;
  const contexte = creerToile(taille);
  const centre = taille / 2;
  contexte.fillStyle = c.grappeAnneau;
  contexte.beginPath();
  contexte.arc(centre, centre, centre, 0, Math.PI * 2);
  contexte.fill();
  contexte.fillStyle = c.grappe;
  contexte.beginPath();
  contexte.arc(centre, centre, centre - 4 * RATIO, 0, Math.PI * 2);
  contexte.fill();
  contexte.fillStyle = c.grappeTexte;
  contexte.font = `600 ${15 * RATIO}px ${c.police}`;
  contexte.textAlign = 'center';
  contexte.textBaseline = 'middle';
  contexte.direction = 'ltr';
  contexte.fillText(String(nombre), centre, centre + RATIO);
  return contexte.getImageData(0, 0, taille, taille);
}

export interface ImagesCarte {
  fixes: Record<string, ImageData>;
  couleurs: Couleurs;
}

/** Prépare les marqueurs du thème actif, avant de créer ou de redessiner la carte. */
export async function preparerImages(): Promise<ImagesCarte> {
  const c = lireCouleurs();
  await document.fonts.load(`600 15px ${c.police}`).catch(() => undefined);
  const dessiner = async (nom: string, svg: string, l: number, h: number) =>
    [nom, await rasteriser(svg, l, h)] as const;
  const { largeur, hauteur } = MARQUEUR;
  const images = await Promise.all([
    dessiner('marqueur-inscrite', svgMarqueur(true, c), largeur, hauteur),
    dessiner('marqueur-non-inscrite', svgMarqueur(false, c), largeur, hauteur),
    dessiner('selection-inscrite', svgSelection(true, c), SELECTION.largeur, SELECTION.hauteur),
    dessiner('selection-non-inscrite', svgSelection(false, c), SELECTION.largeur, SELECTION.hauteur),
  ]);
  return { fixes: Object.fromEntries(images), couleurs: c };
}

/**
 * MapLibre demande une image dès qu'il en a besoin, y compris après un changement de style.
 * Les grappes ont le nombre dans l'image : il reste lisible si les polices du fond échouent.
 */
export function fournirImages(carte: CarteMapLibre, images: () => ImagesCarte): void {
  carte.setMissingStyleImageResolver((id) => {
    if (carte.hasImage(id)) {
      return;
    }
    const { fixes, couleurs } = images();
    const grappe = /^grappe-(\d+)$/.exec(id);
    const image = grappe
      ? dessinerGrappe(Number.parseInt(grappe[1], 10), couleurs)
      : fixes[id];
    if (image) {
      carte.addImage(id, image, { pixelRatio: RATIO });
    }
  });
}
