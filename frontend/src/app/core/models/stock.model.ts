/** Les trois statuts qu'une pharmacie peut déclarer (R4). */
export type StatutDeclare = 'disponible' | 'quantite-limitee' | 'en-rupture';

/** Statut visible : « à confirmer » est calculé après 24 h, il n'est jamais déclaré. */
export type StatutStock = StatutDeclare | 'a-confirmer';

export interface Stock {
  pharmacieId: string;
  medicamentId: string;
  /** Conservé même après 24 h : F7 ajoute une mention et ne supprime pas le statut. */
  statutDeclare: StatutDeclare;
  /** Date et heure de la déclaration, au format ISO 8601. */
  declareLe: string;
}

export const DUREE_VALIDITE_MS = 24 * 60 * 60 * 1000;

/** Vrai quand la déclaration date de plus de 24 h (R6). */
export function estAConfirmer(stock: Stock, maintenant: Date = new Date()): boolean {
  return maintenant.getTime() - new Date(stock.declareLe).getTime() > DUREE_VALIDITE_MS;
}

export function statutStock(stock: Stock, maintenant: Date = new Date()): StatutStock {
  return estAConfirmer(stock, maintenant) ? 'a-confirmer' : stock.statutDeclare;
}

/** Un statut s'exprime toujours par un mot (R15). */
export const LIBELLES_STATUT: Record<StatutStock, string> = {
  disponible: 'Disponible',
  'quantite-limitee': 'Quantité limitée',
  'en-rupture': 'En rupture',
  'a-confirmer': 'À confirmer',
};
