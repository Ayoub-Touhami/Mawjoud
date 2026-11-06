import { Injectable } from '@angular/core';
import { Alerte } from '../models';

/**
 * SIMULATION PROVISOIRE, à remplacer par le back-end. Seuls l'e-mail, le mot de passe protégé,
 * le médicament et la ville sont conservés, avec les jetons techniques des liens.
 */
export interface CompteSimule {
  id: string;
  email: string;
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

  enregistrer(modification: Partial<DonneesSimulees>): void {
    this.donnees = { ...this.donnees, ...modification };
    try {
      localStorage.setItem(CLE, JSON.stringify(this.donnees));
    } catch {
      // Stockage indisponible : la simulation reste valable pour cette visite.
    }
  }

  private lire(): DonneesSimulees {
    const vide: DonneesSimulees = { comptes: [], alertes: [], sessionId: null };
    try {
      return { ...vide, ...JSON.parse(localStorage.getItem(CLE) ?? '{}') };
    } catch {
      return vide;
    }
  }
}
