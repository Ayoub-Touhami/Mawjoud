import { inject, Injectable } from '@angular/core';
import { PHARMACIES_TEST } from '../donnees-test/pharmacies';
import { EtatPharmacie, Pharmacie } from '../models';
import { StockageSimulation } from './stockage-simulation';

/**
 * SIMULATION : l'annuaire vu par tous les écrans. Il réunit les données de test, les fiches
 * ajoutées, les corrections et les fusions, et calcule l'état de chaque pharmacie.
 */
@Injectable({ providedIn: 'root' })
export class AnnuaireSimule {
  private readonly stockage = inject(StockageSimulation);

  /** Toutes les fiches, fermées comprises : la vue de l'administrateur. */
  toutes(): Pharmacie[] {
    const { fiches, fusions } = this.stockage;
    return [...PHARMACIES_TEST, ...this.stockage.fichesAjoutees]
      .filter((p) => !fusions[p.id])
      .map((p) => {
        const fiche = { ...p, ...fiches[p.id] };
        return { ...fiche, etat: this.etat(fiche) };
      });
  }

  /** Une pharmacie fermée ne se montre plus au public. */
  publiques(): Pharmacie[] {
    return this.toutes().filter((p) => !p.fermee);
  }

  /** Suit les fusions : l'ancien identifiant mène à la fiche gardée. */
  resoudre(id: string): string {
    const { fusions } = this.stockage;
    let courant = id;
    while (fusions[courant]) {
      courant = fusions[courant];
    }
    return courant;
  }

  trouver(id: string): Pharmacie | undefined {
    const cible = this.resoudre(id);
    return this.toutes().find((p) => p.id === cible);
  }

  /** Seule une pharmacie inscrite, ouverte et non suspendue montre ses stocks au public. */
  stocksVisibles(id: string): boolean {
    const pharmacie = this.trouver(id);
    return pharmacie?.etat === 'inscrite' && !pharmacie.fermee;
  }

  /** « Inscrite » suit une validation, jamais une simple correction de fiche (F8). */
  private etat(pharmacie: Pharmacie): EtatPharmacie {
    const { comptes, demandes, inscriptionsRetirees } = this.stockage;
    if (comptes.some((c) => c.pharmacieId === pharmacie.id && c.suspendu)) {
      return 'non-inscrite';
    }
    const liees = demandes.filter((d) => d.pharmacieId === pharmacie.id);
    if (liees.some((d) => d.etat === 'validee')) {
      return 'inscrite';
    }
    if (liees.some((d) => d.etat === 'en-attente' && !d.conflit)) {
      return 'reclamee';
    }
    return inscriptionsRetirees.includes(pharmacie.id) ? 'non-inscrite' : pharmacie.etat;
  }
}
