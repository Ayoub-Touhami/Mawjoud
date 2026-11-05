import { DUREE_VALIDITE_MS, estAConfirmer, statutStock, Stock } from './stock.model';

const maintenant = new Date('2026-11-05T12:00:00.000Z');
const stockAge = (ms: number): Stock => ({
  pharmacieId: 'p',
  medicamentId: 'm',
  statutDeclare: 'disponible',
  declareLe: new Date(maintenant.getTime() - ms).toISOString(),
});

describe('statut « à confirmer »', () => {
  it('reste valable à 24 h pile', () => {
    expect(estAConfirmer(stockAge(DUREE_VALIDITE_MS), maintenant)).toBe(false);
  });

  it('passe à « à confirmer » au-delà de 24 h, sans perdre le statut déclaré', () => {
    const stock = stockAge(DUREE_VALIDITE_MS + 1);
    expect(statutStock(stock, maintenant)).toBe('a-confirmer');
    expect(stock.statutDeclare).toBe('disponible');
  });
});
