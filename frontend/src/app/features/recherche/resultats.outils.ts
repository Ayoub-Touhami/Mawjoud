import { Pharmacie, StatutDeclare, statutStock, StatutStock, Stock } from '../../core/models';
import { Coordonnees, distanceMetres, estInscrite } from '../../core/outils/pharmacie.outils';

export interface LigneResultat {
  pharmacie: Pharmacie;
  /** Présent seulement si la pharmacie a déclaré ce médicament. */
  stock: Stock | null;
  statut: StatutStock | null;
  distance: number | null;
}

export interface GroupesResultats {
  declares: LigneResultat[];
  nonDeclares: LigneResultat[];
  nonInscrites: LigneResultat[];
  triParDistance: boolean;
}

/** Le dernier statut déclaré est le seul affiché (F3). */
function dernierParPharmacie(stocks: Stock[]): Map<string, Stock> {
  const index = new Map<string, Stock>();
  for (const stock of stocks) {
    const connu = index.get(stock.pharmacieId);
    if (!connu || connu.declareLe < stock.declareLe) {
      index.set(stock.pharmacieId, stock);
    }
  }
  return index;
}

function comparer(a: LigneResultat, b: LigneResultat): number {
  if (a.distance !== null && b.distance !== null) {
    return a.distance - b.distance;
  }
  return (
    a.pharmacie.gouvernorat.localeCompare(b.pharmacie.gouvernorat) ||
    a.pharmacie.ville.localeCompare(b.pharmacie.ville) ||
    a.pharmacie.nom.localeCompare(b.pharmacie.nom)
  );
}

export function construireGroupes(
  pharmacies: Pharmacie[],
  stocks: Stock[],
  zone: string | null,
  position: Coordonnees | null,
  maintenant: Date = new Date(),
): GroupesResultats {
  const derniers = dernierParPharmacie(stocks);
  const lignes = pharmacies
    .filter((p) => !zone || p.gouvernorat === zone)
    .map((pharmacie): LigneResultat => {
      const stock = derniers.get(pharmacie.id) ?? null;
      return {
        pharmacie,
        stock,
        statut: stock ? statutStock(stock, maintenant) : null,
        distance: position ? distanceMetres(position, pharmacie) : null,
      };
    })
    .sort(comparer);
  return {
    declares: lignes.filter((l) => l.stock),
    nonDeclares: lignes.filter((l) => !l.stock && estInscrite(l.pharmacie)),
    nonInscrites: lignes.filter((l) => !l.stock && !estInscrite(l.pharmacie)),
    triParDistance: !!position,
  };
}

/** Vrai si toutes les déclarations de la zone disent « en rupture », même anciennes. */
export function enRupturePartout(groupes: GroupesResultats): boolean {
  const statuts: (StatutDeclare | undefined)[] = groupes.declares.map(
    (l) => l.stock?.statutDeclare,
  );
  return statuts.length > 0 && statuts.every((s) => s === 'en-rupture');
}
