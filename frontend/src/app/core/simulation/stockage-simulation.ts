import { Injectable } from '@angular/core';
import { DEMANDES_TEST } from '../donnees-test/comptes';
import { Alerte, DemandeReclamation, Role, Stock } from '../models';

/**
 * SIMULATION PROVISOIRE, à remplacer par le back-end. Seuls l'e-mail, le mot de passe protégé,
 * le médicament et la ville sont conservés, avec les jetons techniques des liens.
 */
export interface CompteSimule {
  id: string;
  email: string;
  role: Role;
  /** Pharmacien : vrai après la validation de l'administrateur. */
  compteVerifie?: boolean;
  /** Pharmacien : une seule pharmacie par compte, le reste n'est pas décidé. */
  pharmacieId?: string;
  /** Empreinte du mot de passe : il n'est jamais écrit en clair. */
  empreinte: string;
  sel: string;
  emailVerifie: boolean;
  jetonVerification: string | null;
  /** Date limite du lien, en millisecondes. */
  expirationJeton: number;
  jetonDesabonnement: string;
}

interface DonneesSimulees {
  comptes: CompteSimule[];
  alertes: Alerte[];
  sessionId: string | null;
  demandes: DemandeReclamation[];
  /** Déclarations faites dans la simulation : une seule par pharmacie et médicament. */
  stocksDeclares: Stock[];
  /** Médicaments ajoutés sans statut, et retirés, au format « pharmacie|médicament ». */
  suivis: string[];
  stocksRetires: string[];
}

const CLE = 'mawjoud.simulation';

/** Mémoire doublée de localStorage, pour retrouver les comptes après un rechargement. */
@Injectable({ providedIn: 'root' })
export class StockageSimulation {
  private donnees = this.lire();

  get comptes(): CompteSimule[] {
    return this.donnees.comptes;
  }

  get alertes(): Alerte[] {
    return this.donnees.alertes;
  }

  get sessionId(): string | null {
    return this.donnees.sessionId;
  }

  get demandes(): DemandeReclamation[] {
    return this.donnees.demandes;
  }

  get stocksDeclares(): Stock[] {
    return this.donnees.stocksDeclares;
  }

  get suivis(): string[] {
    return this.donnees.suivis;
  }

  get stocksRetires(): string[] {
    return this.donnees.stocksRetires;
  }

  enregistrer(modification: Partial<DonneesSimulees>): void {
    this.donnees = { ...this.donnees, ...modification };
    try {
      localStorage.setItem(CLE, JSON.stringify(this.donnees));
    } catch {
      // Stockage indisponible : la simulation reste valable pour cette visite.
    }
  }

  private lire(): DonneesSimulees {
    const vide: DonneesSimulees = {
      comptes: [],
      alertes: [],
      sessionId: null,
      demandes: DEMANDES_TEST,
      stocksDeclares: [],
      suivis: [],
      stocksRetires: [],
    };
    try {
      return { ...vide, ...JSON.parse(localStorage.getItem(CLE) ?? '{}') };
    } catch {
      return vide;
    }
  }
}
