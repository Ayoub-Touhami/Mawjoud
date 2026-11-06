import { calculerLimites, centreDe, contraindre, dansTunisie } from './cadrage';

const MARGES = { haut: 160, bas: 30, gauche: 12, droite: 12 };

describe('cadrage de la Tunisie', () => {
  it('fixe la vue au zoom minimal, sur mobile comme sur ordinateur', () => {
    for (const [largeur, hauteur] of [
      [390, 844],
      [1440, 820],
    ]) {
      const limites = calculerLimites(largeur, hauteur, MARGES);
      const centre = centreDe(limites);
      const loin = { longitude: 0, latitude: 50 };
      const vue = contraindre(limites, largeur, hauteur, loin, 1);
      expect(vue.zoom).toBe(limites.zoomMinimal);
      expect(vue.longitude).toBeCloseTo(centre.longitude, 6);
      expect(vue.latitude).toBeCloseTo(centre.latitude, 6);
    }
  });

  it('laisse se déplacer après un zoom, sans sortir de la zone', () => {
    const limites = calculerLimites(390, 844, MARGES);
    const zoom = limites.zoomMinimal + 3;
    const sud = contraindre(limites, 390, 844, { longitude: 9.1, latitude: 30.3 }, zoom);
    expect(sud.latitude).toBeLessThan(31);
    const horsZone = contraindre(limites, 390, 844, { longitude: 20, latitude: 45 }, zoom);
    expect(horsZone.longitude).toBeLessThan(11.7);
    expect(horsZone.latitude).toBeLessThan(37.6);
  });

  it('reconnaît les lieux de Tunisie et les pays voisins', () => {
    expect(dansTunisie({ latitude: 36.8, longitude: 10.18 })).toBe(true);
    expect(dansTunisie({ latitude: 33.82, longitude: 10.85 })).toBe(true);
    expect(dansTunisie({ latitude: 30.4, longitude: 9.6 })).toBe(true);
    expect(dansTunisie({ latitude: 36.9, longitude: 7.75 })).toBe(false);
    expect(dansTunisie({ latitude: 32.9, longitude: 13.18 })).toBe(false);
    expect(dansTunisie({ latitude: 48.85, longitude: 2.35 })).toBe(false);
  });
});
