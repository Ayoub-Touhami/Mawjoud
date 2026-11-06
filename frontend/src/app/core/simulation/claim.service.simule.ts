import { inject, Injectable } from '@angular/core';
import { map, Observable, of, throwError } from 'rxjs';
import { DemandeReclamation, Justificatif, Pharmacie, PharmacieProposee } from '../models';
import { LONGUEUR_MINIMALE, motTrouve, normaliser } from '../outils/recherche.outils';
import { ClaimService, ErreurReclamation } from '../services/claim.service';
import { HORLOGE } from '../services/horloge';
import { PHARMACIE_API } from '../services/pharmacie-api';
import { SessionService } from '../services/session.service';
import { AnnuaireSimule } from './annuaire-simule';
import { StockageSimulation } from './stockage-simulation';

const refus = (erreur: ErreurReclamation) => throwError(() => erreur);
const RESULTATS_MAX = 20;

/** SIMULATION : les demandes restent dans le navigateur, le fichier joint n'est jamais gardé. */
@Injectable({ providedIn: 'root' })
export class ClaimServiceSimule implements ClaimService {
  private readonly stockage = inject(StockageSimulation);
  private readonly session = inject(SessionService);
  private readonly annuaire = inject(AnnuaireSimule);
  private readonly api = inject(PHARMACIE_API);
  private readonly horloge = inject(HORLOGE);

  chercherPharmacies(texte: string): Observable<Pharmacie[]> {
    const mots = normaliser(texte).split(' ').filter(Boolean);
    if (normaliser(texte).length < LONGUEUR_MINIMALE) {
      return of([]);
    }
    return this.api.listerPharmacies().pipe(
      map((pharmacies) =>
        pharmacies
          .filter((p) => {
            const champ = normaliser(`${p.nom} ${p.ville} ${p.adresse}`);
            return mots.every((mot) => motTrouve(mot, champ));
          })
          .slice(0, RESULTATS_MAX),
      ),
    );
  }

  maDemande(): Observable<DemandeReclamation | null> {
    const id = this.session.utilisateur()?.id;
    return of(this.stockage.demandes.filter((d) => d.pharmacienId === id).at(-1) ?? null);
  }

  reclamer(pharmacieId: string, justificatif: Justificatif): Observable<DemandeReclamation> {
    const refusee = this.controler();
    if (refusee) {
      return refus(refusee);
    }
    const conflit =
      this.annuaire.trouver(pharmacieId)?.etat !== 'non-inscrite' ||
      this.stockage.demandes.some(
        (d) => d.pharmacieId === pharmacieId && d.etat === 'en-attente',
      );
    return of(this.creer({ pharmacieId, justificatif, ...(conflit ? { conflit } : {}) }));
  }

  demanderAjout(
    ajout: PharmacieProposee,
    justificatif: Justificatif,
  ): Observable<DemandeReclamation> {
    const refusee = this.controler();
    return refusee ? refus(refusee) : of(this.creer({ pharmacieId: null, ajout, justificatif }));
  }

  private controler(): ErreurReclamation | null {
    const id = this.session.utilisateur()?.id;
    if (!id) {
      return 'non-connecte';
    }
    const enCours = this.stockage.demandes.some(
      (d) => d.pharmacienId === id && d.etat === 'en-attente',
    );
    return enCours ? 'demande-en-cours' : null;
  }

  private creer(
    contenu: Pick<DemandeReclamation, 'pharmacieId' | 'justificatif' | 'conflit' | 'ajout'>,
  ): DemandeReclamation {
    const demande: DemandeReclamation = {
      ...contenu,
      id: crypto.randomUUID(),
      pharmacienId: this.session.utilisateur()?.id as string,
      etat: 'en-attente',
      creeeLe: this.horloge().toISOString(),
    };
    this.stockage.enregistrer({ demandes: [...this.stockage.demandes, demande] });
    return demande;
  }
}
