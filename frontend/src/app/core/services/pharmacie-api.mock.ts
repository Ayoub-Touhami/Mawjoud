import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { COMPTES_TEST, DEMANDES_TEST } from '../donnees-test/comptes';
import { MEDICAMENTS_TEST } from '../donnees-test/medicaments';
import { PHARMACIES_TEST } from '../donnees-test/pharmacies';
import { fabriquerStocks } from '../donnees-test/stocks';
import {
  DemandeReclamation,
  Medicament,
  Pharmacie,
  StatutDeclare,
  Stock,
  Utilisateur,
} from '../models';
import { chercherDans } from '../outils/recherche.outils';
import { PharmacieApi } from './pharmacie-api';

/**
 * Simulation en mémoire, à partir de données de test. Tout est perdu au rechargement
 * de la page. Les comptes patients et les alertes sont dans core/simulation.
 */
@Injectable()
export class PharmacieApiMock implements PharmacieApi {
  private pharmacies: Pharmacie[] = PHARMACIES_TEST.map((p) => ({ ...p }));
  private stocks: Stock[] = fabriquerStocks();
  private comptes: Utilisateur[] = COMPTES_TEST.map((c) => ({ ...c }));
  private demandes: DemandeReclamation[] = DEMANDES_TEST.map((d) => ({ ...d }));
  private prochainId = 1;

  listerPharmacies(ville?: string): Observable<Pharmacie[]> {
    return of(this.pharmacies.filter((p) => !ville || p.ville === ville));
  }

  obtenirPharmacie(id: string): Observable<Pharmacie | undefined> {
    return of(this.pharmacies.find((p) => p.id === id));
  }

  listerVilles(): Observable<string[]> {
    return of([...new Set(this.pharmacies.map((p) => p.ville))].sort((a, b) => a.localeCompare(b)));
  }

  listerMedicaments(): Observable<Medicament[]> {
    return of(MEDICAMENTS_TEST);
  }

  obtenirMedicament(id: string): Observable<Medicament | undefined> {
    return of(MEDICAMENTS_TEST.find((m) => m.id === id));
  }

  chercherMedicaments(texte: string): Observable<Medicament[]> {
    return of(chercherDans(MEDICAMENTS_TEST, texte));
  }

  medicamentsProches(texte: string): Observable<Medicament[]> {
    return of(chercherDans(MEDICAMENTS_TEST, texte, true));
  }

  stocksDePharmacie(pharmacieId: string): Observable<Stock[]> {
    return of(this.stocks.filter((s) => s.pharmacieId === pharmacieId));
  }

  stocksDeMedicament(medicamentId: string, ville?: string): Observable<Stock[]> {
    const pharmaciesRetenues = new Set(
      this.pharmacies.filter((p) => !ville || p.ville === ville).map((p) => p.id),
    );
    return of(
      this.stocks.filter(
        (s) => s.medicamentId === medicamentId && pharmaciesRetenues.has(s.pharmacieId),
      ),
    );
  }

  declarerStock(
    utilisateurId: string,
    pharmacieId: string,
    medicamentId: string,
    statut: StatutDeclare,
  ): Observable<Stock> {
    const compte = this.comptes.find((c) => c.id === utilisateurId);
    if (!compte?.compteVerifie || compte.pharmacieId !== pharmacieId) {
      return throwError(() => new Error('Déclaration refusée pour ce compte.'));
    }
    const stock: Stock = {
      pharmacieId,
      medicamentId,
      statutDeclare: statut,
      declareLe: new Date().toISOString(),
    };
    this.stocks = [
      ...this.stocks.filter(
        (s) => s.pharmacieId !== pharmacieId || s.medicamentId !== medicamentId,
      ),
      stock,
    ];
    return of(stock);
  }

  listerDemandes(): Observable<DemandeReclamation[]> {
    return of(this.demandes);
  }

  creerDemande(pharmacienId: string, pharmacieId: string): Observable<DemandeReclamation> {
    const pharmacie = this.pharmacies.find((p) => p.id === pharmacieId);
    if (!pharmacie) {
      return throwError(() => new Error('Pharmacie introuvable.'));
    }
    const demande: DemandeReclamation = {
      id: this.nouvelId('dem'),
      pharmacieId,
      pharmacienId,
      etat: 'en-attente',
      creeeLe: new Date().toISOString(),
    };
    this.demandes = [...this.demandes, demande];
    if (pharmacie.etat === 'non-inscrite') {
      pharmacie.etat = 'reclamee';
    }
    return of(demande);
  }

  /** Seule cette validation humaine rend une pharmacie inscrite (F8). */
  validerDemande(id: string): Observable<DemandeReclamation> {
    const demande = this.demandes.find((d) => d.id === id);
    const pharmacie = this.pharmacies.find((p) => p.id === demande?.pharmacieId);
    const compte = this.comptes.find((c) => c.id === demande?.pharmacienId);
    if (!demande || !pharmacie || !compte) {
      return throwError(() => new Error('Demande introuvable.'));
    }
    demande.etat = 'validee';
    pharmacie.etat = 'inscrite';
    compte.compteVerifie = true;
    compte.pharmacieId = pharmacie.id;
    return of(demande);
  }

  refuserDemande(id: string, motif: string): Observable<DemandeReclamation> {
    const demande = this.demandes.find((d) => d.id === id);
    if (!demande) {
      return throwError(() => new Error('Demande introuvable.'));
    }
    demande.etat = 'refusee';
    demande.motifRefus = motif;
    return of(demande);
  }

  private nouvelId(prefixe: string): string {
    return `${prefixe}-nouveau-${this.prochainId++}`;
  }
}
