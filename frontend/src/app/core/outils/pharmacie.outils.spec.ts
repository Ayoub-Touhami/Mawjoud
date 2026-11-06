import { Pharmacie } from '../models';
import {
  distanceMetres,
  etatOuverture,
  lienItineraire,
  lienTelephone,
  telephoneLisible,
} from './pharmacie.outils';

const pharmacie = { latitude: 36.8, longitude: 10.18 } as Pharmacie;
const HORAIRES = [{ jours: [1, 2, 3, 4, 5, 6], ouverture: '08:00', fermeture: '20:00' }];

describe('outils de la fiche pharmacie', () => {
  it('calcule une distance connue', () => {
    const tunisSfax = distanceMetres(
      { latitude: 36.8065, longitude: 10.1815 },
      { latitude: 34.7406, longitude: 10.7603 },
    );
    expect(tunisSfax / 1000).toBeGreaterThan(230);
    expect(tunisSfax / 1000).toBeLessThan(240);
  });

  it('prépare le lien tel: et le numéro lisible', () => {
    expect(lienTelephone('+216 00 000 001')).toBe('tel:+21600000001');
    expect(telephoneLisible('+21600000001')).toBe('+216 00 000 001');
    expect(telephoneLisible('71343637')).toBe('71 343 637');
    expect(telephoneLisible('123')).toBe('123');
  });

  it("ne met que la destination dans le lien d'itinéraire", () => {
    expect(lienItineraire(pharmacie, 'Linux; Android 14')).toBe('geo:36.8,10.18?q=36.8,10.18');
    expect(lienItineraire(pharmacie, 'iPhone')).toBe('https://maps.apple.com/?daddr=36.8,10.18');
    const ordinateur = lienItineraire(pharmacie, 'Windows NT');
    expect(ordinateur).toContain('destination=36.8,10.18');
    expect(ordinateur).not.toContain('origin');
  });

  it("donne l'ouverture à l'heure de Tunis", () => {
    // Mercredi 4 novembre 2026, 15 h à Tunis.
    expect(etatOuverture(HORAIRES, new Date('2026-11-04T14:00:00Z'))).toEqual({
      ouverte: true,
      jusqua: '20:00',
    });
    // Dimanche 8 novembre 2026.
    expect(etatOuverture(HORAIRES, new Date('2026-11-08T14:00:00Z'))).toEqual({ ouverte: false });
    expect(etatOuverture([])).toBeNull();
  });
});
