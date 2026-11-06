import { Pharmacie, Stock } from '../../core/models';
import { construireGroupes, enRupturePartout } from './resultats.outils';

const maintenant = new Date('2026-11-05T12:00:00.000Z');
const pharmacie = (
  id: string,
  etat: Pharmacie['etat'],
  gouvernorat: string,
  latitude: number,
): Pharmacie =>
  ({ id, nom: id, ville: gouvernorat, gouvernorat, etat, latitude, longitude: 10 }) as Pharmacie;
const stock = (pharmacieId: string, heures: number, statutDeclare: Stock['statutDeclare']): Stock => ({
  pharmacieId,
  medicamentId: 'M1',
  statutDeclare,
  declareLe: new Date(maintenant.getTime() - heures * 3600000).toISOString(),
});

const LISTE = [
  pharmacie('a', 'inscrite', 'Tunis', 37),
  pharmacie('b', 'inscrite', 'Sfax', 34.7),
  pharmacie('c', 'inscrite', 'Sfax', 34.8),
  pharmacie('d', 'non-inscrite', 'Tunis', 36.9),
  pharmacie('e', 'reclamee', 'Sfax', 34.75),
];

describe('groupes de résultats', () => {
  it('sépare déclarées, inscrites sans déclaration et non inscrites', () => {
    const g = construireGroupes(LISTE, [stock('a', 1, 'disponible')], null, null, maintenant);
    expect(g.declares.map((l) => l.pharmacie.id)).toEqual(['a']);
    expect(g.nonDeclares.map((l) => l.pharmacie.id)).toEqual(['b', 'c']);
    expect(g.nonInscrites.map((l) => l.pharmacie.id)).toEqual(['e', 'd']);
    expect(g.triParDistance).toBe(false);
  });

  it('trie par distance quand la position est connue', () => {
    const stocks = [stock('a', 1, 'disponible'), stock('b', 1, 'en-rupture')];
    const g = construireGroupes(LISTE, stocks, null, { latitude: 34.7, longitude: 10 }, maintenant);
    expect(g.declares.map((l) => l.pharmacie.id)).toEqual(['b', 'a']);
    expect(g.declares[0].distance).toBeLessThan(1);
    expect(g.triParDistance).toBe(true);
  });

  it('filtre par gouvernorat', () => {
    const g = construireGroupes(LISTE, [], 'Tunis', null, maintenant);
    expect(g.nonDeclares.map((l) => l.pharmacie.id)).toEqual(['a']);
    expect(g.nonInscrites.map((l) => l.pharmacie.id)).toEqual(['d']);
  });

  it('ne garde que le dernier statut et marque « à confirmer » après 24 h', () => {
    const stocks = [stock('a', 30, 'disponible'), stock('a', 26, 'quantite-limitee')];
    const [ligne] = construireGroupes(LISTE, stocks, null, null, maintenant).declares;
    expect(ligne.statut).toBe('a-confirmer');
    expect(ligne.stock?.statutDeclare).toBe('quantite-limitee');
  });

  it('reconnaît la rupture partout, même ancienne', () => {
    const rupture = [stock('a', 30, 'en-rupture'), stock('b', 1, 'en-rupture')];
    expect(enRupturePartout(construireGroupes(LISTE, rupture, null, null, maintenant))).toBe(true);
    const mixte = [...rupture, stock('c', 1, 'disponible')];
    expect(enRupturePartout(construireGroupes(LISTE, mixte, null, null, maintenant))).toBe(false);
    expect(enRupturePartout(construireGroupes(LISTE, [], null, null, maintenant))).toBe(false);
  });
});
