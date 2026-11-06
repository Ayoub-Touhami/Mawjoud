import type {
  ExpressionSpecification,
  FilterSpecification,
  GeoJSONSourceSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { Langue } from '../../core/i18n/traduction.config';
import { Pharmacie } from '../../core/models';
import { Coordonnees, estInscrite } from '../../core/outils/pharmacie.outils';
import { Theme } from '../../core/services/theme.service';
import { environment } from '../../../environments/environment';
import paysVoisins from './pays-voisins.json';

interface Palette {
  terre: string;
  routeMajeure: string;
  routeMineure: string;
  parc: string;
  eau: string;
  eauBord: string;
  frontiere: string;
  texte: string;
  halo: string;
  voile: string;
}

/** Valeurs clair relevées sur les écrans du PDF. */
const PALETTES: Record<Theme, Palette> = {
  clair: {
    terre: '#efe9d9',
    routeMajeure: '#fffcf5',
    routeMineure: '#e2dac7',
    parc: '#ddebde',
    eau: '#cfe3ee',
    eauBord: '#b7d2e4',
    frontiere: '#a59d88',
    texte: '#4a5b53',
    halo: '#f6f1e7',
    voile: '#f6f1e7',
  },
  sombre: {
    terre: '#14251d',
    routeMajeure: '#34463d',
    routeMineure: '#20332a',
    parc: '#16382a',
    eau: '#10303f',
    eauBord: '#1d4a61',
    frontiere: '#5c7066',
    texte: '#a7b8b0',
    halo: '#0c1a14',
    voile: '#0c1a14',
  },
};

export const COUCHES_CLIQUABLES = ['grappes', 'points'];
export const SOURCE_PHARMACIES = 'pharmacies';
export const SOURCE_SELECTION = 'selection';
export const SOURCE_POSITION = 'position';
const SOURCE_FOND = 'fond';

const TEXTE_REGULIER = ['Noto Sans Regular'];
const TEXTE_GRAS = ['Noto Sans Bold'];
const BLEU_POSITION = '#1f6e9c';

export function donneesPharmacies(pharmacies: Pharmacie[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: pharmacies.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      properties: { id: p.id, nom: p.nom, inscrite: estInscrite(p) },
    })),
  };
}

export function donneesPosition(position: Coordonnees | null): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: position
      ? [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [position.longitude, position.latitude] },
            properties: {},
          },
        ]
      : [],
  };
}

export function donneesSelection(pharmacie: Pharmacie | null): GeoJSON.FeatureCollection {
  return pharmacie ? donneesPharmacies([pharmacie]) : donneesPosition(null);
}

function nomDesLieux(langue: Langue): ExpressionSpecification {
  return langue === 'ar'
    ? ['coalesce', ['get', 'name:ar'], ['get', 'name']]
    : ['coalesce', ['get', 'name:fr'], ['get', 'name:latin'], ['get', 'name']];
}

function route(
  id: string,
  classes: string[],
  minzoom: number,
  couleur: string,
  largeurs: number[],
): LayerSpecification {
  return {
    id,
    type: 'line',
    source: SOURCE_FOND,
    'source-layer': 'transportation',
    minzoom,
    filter: [
      'all',
      ['==', ['geometry-type'], 'LineString'],
      ['in', ['get', 'class'], ['literal', classes]],
    ] as FilterSpecification,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': couleur,
      'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], ...largeurs],
    },
  };
}

function lieux(
  id: string,
  classes: string[],
  minzoom: number,
  police: string[],
  tailles: number[],
  p: Palette,
  langue: Langue,
): LayerSpecification {
  return {
    id,
    type: 'symbol',
    source: SOURCE_FOND,
    'source-layer': 'place',
    minzoom,
    filter: [
      'all',
      ['in', ['get', 'class'], ['literal', classes]],
      // Les noms des pays voisins disparaissent : seule la Tunisie porte des étiquettes.
      ['!', ['within', paysVoisins.geometry]],
    ] as FilterSpecification,
    layout: {
      'text-field': nomDesLieux(langue),
      'text-font': police,
      'text-size': ['interpolate', ['linear'], ['zoom'], ...tailles],
      'text-max-width': 8,
    },
    paint: { 'text-color': p.texte, 'text-halo-color': p.halo, 'text-halo-width': 1.5 },
  };
}

/** Le fond : sable, routes, parcs et eau, sans commerces, sans bâtiments et peu d'étiquettes. */
function couchesFond(p: Palette, langue: Langue): LayerSpecification[] {
  return [
    { id: 'terre', type: 'background', paint: { 'background-color': p.terre } },
    {
      id: 'parcs',
      type: 'fill',
      source: SOURCE_FOND,
      'source-layer': 'park',
      paint: { 'fill-color': p.parc },
    },
    {
      id: 'verdure',
      type: 'fill',
      source: SOURCE_FOND,
      'source-layer': 'landcover',
      minzoom: 10,
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass']]] as FilterSpecification,
      paint: { 'fill-color': p.parc, 'fill-opacity': 0.6 },
    },
    {
      id: 'eau',
      type: 'fill',
      source: SOURCE_FOND,
      'source-layer': 'water',
      paint: { 'fill-color': p.eau },
    },
    {
      id: 'eau-bord',
      type: 'line',
      source: SOURCE_FOND,
      'source-layer': 'water',
      minzoom: 8,
      paint: { 'line-color': p.eauBord, 'line-width': 1.5 },
    },
    {
      id: 'cours-eau',
      type: 'line',
      source: SOURCE_FOND,
      'source-layer': 'waterway',
      minzoom: 11,
      paint: { 'line-color': p.eauBord, 'line-width': 1 },
    },
    route('routes-mineures', ['tertiary', 'minor', 'service'], 12, p.routeMineure, [
      12, 0.5, 14, 2, 18, 9,
    ]),
    route('routes-majeures', ['motorway', 'trunk', 'primary', 'secondary'], 6, p.routeMajeure, [
      6, 0.5, 10, 1.5, 14, 6, 18, 22,
    ]),
    {
      id: 'frontiere',
      type: 'line',
      source: SOURCE_FOND,
      'source-layer': 'boundary',
      filter: [
        'all',
        ['==', ['get', 'admin_level'], 2],
        ['!=', ['get', 'maritime'], 1],
      ] as FilterSpecification,
      paint: { 'line-color': p.frontiere, 'line-width': 1.25, 'line-dasharray': [3, 2] },
    },
    lieux('quartiers', ['suburb', 'neighbourhood'], 13, TEXTE_REGULIER, [13, 11, 16, 13], p, langue),
    lieux('villages', ['village'], 11, TEXTE_REGULIER, [11, 11, 15, 13], p, langue),
    lieux('villes', ['town'], 8, TEXTE_REGULIER, [8, 11, 14, 14], p, langue),
    lieux('grandes-villes', ['city'], 5, TEXTE_GRAS, [5, 11, 10, 14, 14, 16], p, langue),
    {
      id: 'voile-voisins',
      type: 'fill',
      source: 'voisins',
      paint: { 'fill-color': p.voile, 'fill-opacity': 0.78 },
    },
  ];
}

function sourcesFond(): StyleSpecification['sources'] {
  return {
    [SOURCE_FOND]: { type: 'vector', url: environment.carte.tuiles },
    voisins: {
      type: 'geojson',
      data: paysVoisins as GeoJSON.Feature,
      attribution: 'Natural Earth',
    },
  };
}

function selectionVide(pharmacie: Pharmacie | null): GeoJSONSourceSpecification {
  return { type: 'geojson', data: donneesSelection(pharmacie) };
}

const coucheSelection: LayerSpecification = {
  id: 'selection',
  type: 'symbol',
  source: SOURCE_SELECTION,
  layout: {
    'icon-image': ['case', ['get', 'inscrite'], 'selection-inscrite', 'selection-non-inscrite'],
    'icon-anchor': 'bottom',
    'icon-offset': [0, 11],
    'icon-allow-overlap': true,
    'icon-ignore-placement': true,
  },
};

export interface EtatStyle {
  theme: Theme;
  langue: Langue;
  pharmacies: Pharmacie[];
  selection: Pharmacie | null;
  position: Coordonnees | null;
}

/** Style complet de la carte d'accueil. Les noms d'images sont résolus par images-carte.ts. */
export function styleAccueil(etat: EtatStyle): StyleSpecification {
  const palette = PALETTES[etat.theme];
  return {
    version: 8,
    glyphs: environment.carte.glyphes,
    sources: {
      ...sourcesFond(),
      [SOURCE_PHARMACIES]: {
        type: 'geojson',
        data: donneesPharmacies(etat.pharmacies),
        cluster: true,
        clusterRadius: 44,
        clusterMaxZoom: 13,
      },
      [SOURCE_SELECTION]: selectionVide(etat.selection),
      [SOURCE_POSITION]: { type: 'geojson', data: donneesPosition(etat.position) },
    },
    layers: [
      ...couchesFond(palette, etat.langue),
      {
        id: 'position-halo',
        type: 'circle',
        source: SOURCE_POSITION,
        paint: { 'circle-radius': 14, 'circle-color': BLEU_POSITION, 'circle-opacity': 0.25 },
      },
      {
        id: 'position',
        type: 'circle',
        source: SOURCE_POSITION,
        paint: {
          'circle-radius': 6,
          'circle-color': BLEU_POSITION,
          'circle-stroke-color': '#fffcf6',
          'circle-stroke-width': 3,
        },
      },
      {
        id: 'points',
        type: 'symbol',
        source: SOURCE_PHARMACIES,
        filter: ['!', ['has', 'point_count']],
        layout: {
          'icon-image': ['case', ['get', 'inscrite'], 'marqueur-inscrite', 'marqueur-non-inscrite'],
          'icon-anchor': 'bottom',
          'icon-allow-overlap': true,
          'symbol-sort-key': ['case', ['get', 'inscrite'], 1, 0],
        },
      },
      {
        id: 'grappes',
        type: 'symbol',
        source: SOURCE_PHARMACIES,
        filter: ['has', 'point_count'],
        layout: {
          'icon-image': ['concat', 'grappe-', ['get', 'point_count']],
          'icon-allow-overlap': true,
        },
      },
      coucheSelection,
    ],
  };
}

/** Petite carte de la fiche : le même fond, avec la seule pharmacie consultée. */
export function styleFiche(theme: Theme, langue: Langue, pharmacie: Pharmacie): StyleSpecification {
  return {
    version: 8,
    glyphs: environment.carte.glyphes,
    sources: { ...sourcesFond(), [SOURCE_SELECTION]: selectionVide(pharmacie) },
    layers: [...couchesFond(PALETTES[theme], langue), coucheSelection],
  };
}
