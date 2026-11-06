import { Injectable } from '@angular/core';
import {
  COMPTES_TEST,
  DEMANDES_TEST,
  DOUBLON_TEST,
  SIGNALEMENTS_TEST,
} from '../donnees-test/comptes';
import { Alerte, DemandeReclamation, Pharmacie, Role, Signalement, Stock } from '../models';

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
  suspendu?: boolean;
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
  /** Corrections de l'administrateur, par pharmacie. */
  fiches: Record<string, Partial<Pharmacie>>;
  fichesAjoutees: Pharmacie[];
  /** Fiche retirée par une fusion, vers la fiche gardée. */
  fusions: Record<string, string>;
  inscriptionsRetirees: string[];
  /** Pharmacies dont les stocks de test fabriqués ne s'affichent plus. */
  stocksFabriquesRetires: string[];
  signalements: Signalement[];
  /** Entrées du journal d'administration, sans dépendance vers son module. */
  journal: EntreeStockee[];
}

/** Forme d'une entrée du journal : son type complet reste dans l'administration. */
export interface EntreeStockee {
  id: string;
  date: string;
  administrateur: string;
  action: string;
  cible: string;
  detail?: string;
}

/** Sans empreinte, ces comptes ne passent jamais le formulaire de connexion. */
function compteDeTest(compte: (typeof COMPTES_TEST)[number]): CompteSimule {
  return {
    id: compte.id,
    email: compte.email,
    role: compte.role,
    ...(compte.compteVerifie !== undefined ? { compteVerifie: compte.compteVerifie } : {}),
    ...(compte.pharmacieId ? { pharmacieId: compte.pharmacieId } : {}),
    empreinte: '',
    sel: '',
    emailVerifie: compte.emailVerifie,
    jetonVerification: null,
    expirationJeton: 0,
    jetonDesabonnement: `test-${compte.id}`,
  };
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

  get fiches(): Record<string, Partial<Pharmacie>> {
    return this.donnees.fiches;
  }

  get fichesAjoutees(): Pharmacie[] {
    return this.donnees.fichesAjoutees;
  }

  get fusions(): Record<string, string> {
    return this.donnees.fusions;
  }

  get inscriptionsRetirees(): string[] {
    return this.donnees.inscriptionsRetirees;
  }

  get stocksFabriquesRetires(): string[] {
    return this.donnees.stocksFabriquesRetires;
  }

  get signalements(): Signalement[] {
    return this.donnees.signalements;
  }

  get journal(): EntreeStockee[] {
    return this.donnees.journal;
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
      comptes: COMPTES_TEST.map(compteDeTest),
      alertes: [],
      sessionId: null,
      demandes: DEMANDES_TEST,
      stocksDeclares: [],
      suivis: [],
      stocksRetires: [],
      fiches: {},
      fichesAjoutees: [DOUBLON_TEST],
      fusions: {},
      inscriptionsRetirees: [],
      stocksFabriquesRetires: [],
      signalements: SIGNALEMENTS_TEST,
      journal: [],
    };
    try {
      return { ...vide, ...JSON.parse(localStorage.getItem(CLE) ?? '{}') };
    } catch {
      return vide;
    }
  }
}
