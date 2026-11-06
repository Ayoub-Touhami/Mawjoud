const FEUILLE = 'maplibre.css';
const TRAVAILLEUR = 'carte/maplibre-gl-worker.mjs';

/** Charge la feuille de styles de la bibliothèque, une seule fois. */
function chargerFeuille(): Promise<void> {
  const existante = document.querySelector<HTMLLinkElement>(`link[href="${FEUILLE}"]`);
  if (existante) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const lien = document.createElement('link');
    lien.rel = 'stylesheet';
    lien.href = FEUILLE;
    lien.onload = () => resolve();
    lien.onerror = () => resolve();
    document.head.append(lien);
  });
}

/** MapLibre n'est téléchargée que par les pages qui montrent une carte. */
export async function chargerMaplibre(): Promise<typeof import('maplibre-gl')> {
  const [maplibre] = await Promise.all([import('maplibre-gl'), chargerFeuille()]);
  maplibre.setWorkerUrl(new URL(TRAVAILLEUR, document.baseURI).href);
  return maplibre;
}
