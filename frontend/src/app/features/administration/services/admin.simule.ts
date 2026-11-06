import { computed, inject, Injectable, Provider } from '@angular/core';
import { defer, Observable, of } from 'rxjs';
import { DemandeReclamation, Pharmacie } from '../../../core/models';
import { normaliser } from '../../../core/outils/recherche.outils';
import { HORLOGE } from '../../../core/services/horloge';
import { AnnuaireSimule } from '../../../core/simulation/annuaire-simule';
import { AuthServiceSimule } from '../../../core/simulation/auth.service.simule';
import { StockageSimulation } from '../../../core/simulation/stockage-simulation';
import { dansTunisie } from '../../carte/cadrage';
import {
  ActionJournal,
  ADMIN_ABUSE_SERVICE,
  ADMIN_AUTH_SERVICE,
  ADMIN_CLAIM_SERVICE,
  ADMIN_DIRECTORY_SERVICE,
  AdminAbuseService,
  AdminAuthService,
  AdminClaimService,
  AdminDirectoryService,
  AUDIT_LOG_SERVICE,
  AuditLogService,
  ChampsFiche,
  ComptePharmacien,
  DemandeDetaillee,
  EntreeJournal,
  ErreurAdmin,
  FicheAnnuaire,
  MotifDecision,
  NouvelleFiche,
} from './admin.contrats';

/** Exécute une action synchrone à l'abonnement, et transforme ses refus en erreurs. */
const action = (faire: () => void): Observable<void> =>
  defer(() => {
    faire();
    return of(undefined);
  });

/** Un compte n'est désigné que par le début de son identifiant : jamais par son e-mail. */
const nomCompte = (id: string) => `compte ${id.slice(0, 8)}`;

@Injectable({ providedIn: 'root' })
export class AdminAuthServiceSimule implements AdminAuthService {
  private readonly simule = inject(AuthServiceSimule);

  readonly administrateur = computed(() => {
    const compte = this.simule.utilisateur();
    return compte?.role === 'administrateur' ? compte : null;
  });
}

@Injectable({ providedIn: 'root' })
export class AuditLogServiceSimule implements AuditLogService {
  private readonly stockage = inject(StockageSimulation);
  private readonly simule = inject(AuthServiceSimule);
  private readonly horloge = inject(HORLOGE);

  lister(): Observable<EntreeJournal[]> {
    return of([...this.stockage.journal].reverse() as EntreeJournal[]);
  }

  consigner(type: ActionJournal, cible: string, detail?: string): void {
    const entree: EntreeJournal = {
      id: crypto.randomUUID(),
      date: this.horloge().toISOString(),
      administrateur: this.simule.utilisateur()?.email ?? 'raccourci de développement',
      action: type,
      cible,
      ...(detail ? { detail } : {}),
    };
    this.stockage.enregistrer({ journal: [...this.stockage.journal, entree] });
  }
}

/** Efface tout lien entre une pharmacie et son compte, et ses déclarations. */
@Injectable({ providedIn: 'root' })
export class RetraitInscription {
  private readonly stockage = inject(StockageSimulation);
  private readonly simule = inject(AuthServiceSimule);

  retirer(pharmacieId: string, motif: MotifDecision): void {
    const s = this.stockage;
    s.enregistrer({
      demandes: s.demandes.map((d) =>
        d.pharmacieId === pharmacieId && d.etat === 'validee'
          ? { ...d, etat: 'retiree', motifCode: motif.code, motifPrecision: motif.precision }
          : d,
      ),
      comptes: s.comptes.map((c) =>
        c.pharmacieId === pharmacieId
          ? { ...c, compteVerifie: false, pharmacieId: undefined, suspendu: false }
          : c,
      ),
      inscriptionsRetirees: [...new Set([...s.inscriptionsRetirees, pharmacieId])],
      stocksFabriquesRetires: [...new Set([...s.stocksFabriquesRetires, pharmacieId])],
      stocksDeclares: s.stocksDeclares.filter((d) => d.pharmacieId !== pharmacieId),
      suivis: s.suivis.filter((c) => !c.startsWith(`${pharmacieId}|`)),
    });
    this.simule.rafraichirSession();
  }
}

@Injectable({ providedIn: 'root' })
export class AdminClaimServiceSimule implements AdminClaimService {
  private readonly stockage = inject(StockageSimulation);
  private readonly annuaire = inject(AnnuaireSimule);
  private readonly simule = inject(AuthServiceSimule);
  private readonly journal = inject(AuditLogServiceSimule);

  listerDemandes(): Observable<DemandeDetaillee[]> {
    return of(
      this.stockage.demandes
        .filter((d) => d.etat === 'en-attente')
        .sort((a, b) => a.creeeLe.localeCompare(b.creeeLe))
        .map((d) => this.detailler(d)),
    );
  }

  obtenirDossier(id: string): Observable<DemandeDetaillee[]> {
    const demande = this.stockage.demandes.find((d) => d.id === id);
    return of(demande ? [demande, ...this.concurrentes(demande)].map((d) => this.detailler(d)) : []);
  }

  validerDemande(id: string, motifAutres?: MotifDecision): Observable<void> {
    return action(() => this.valider(id, motifAutres));
  }

  refuserDemande(id: string, motif: MotifDecision): Observable<void> {
    return action(() => {
      if (!motif.code) {
        throw 'motif-requis' satisfies ErreurAdmin;
      }
      this.refuser(id, motif);
    });
  }

  creerFicheEtValider(id: string, fiche: NouvelleFiche): Observable<void> {
    return action(() => {
      if (!dansTunisie(fiche)) {
        throw 'hors-tunisie' satisfies ErreurAdmin;
      }
      const pharmacieId = `A-${crypto.randomUUID().slice(0, 8)}`;
      const nouvelle: Pharmacie = {
        ...fiche,
        id: pharmacieId,
        horaires: [],
        etat: 'non-inscrite',
        source: 'Demande d\'ajout validée',
      };
      const s = this.stockage;
      s.enregistrer({
        fichesAjoutees: [...s.fichesAjoutees, nouvelle],
        demandes: s.demandes.map((d) => (d.id === id ? { ...d, pharmacieId } : d)),
      });
      this.journal.consigner('creer-fiche', fiche.nom);
      this.valider(id);
    });
  }

  private valider(id: string, motifAutres?: MotifDecision): void {
    const s = this.stockage;
    const demande = s.demandes.find((d) => d.id === id && d.etat === 'en-attente');
    if (!demande?.pharmacieId) {
      throw 'introuvable' satisfies ErreurAdmin;
    }
    const pharmacieId = this.annuaire.resoudre(demande.pharmacieId);
    if (this.annuaire.trouver(pharmacieId)?.etat === 'inscrite') {
      throw 'deja-inscrite' satisfies ErreurAdmin;
    }
    const autres = this.concurrentes(demande);
    if (autres.length && !motifAutres?.code) {
      throw 'motif-requis' satisfies ErreurAdmin;
    }
    autres.forEach((d) => this.refuser(d.id, motifAutres as MotifDecision));
    s.enregistrer({
      demandes: s.demandes.map((d) => (d.id === id ? { ...d, etat: 'validee', pharmacieId } : d)),
      comptes: s.comptes.map((c) =>
        c.id === demande.pharmacienId ? { ...c, compteVerifie: true, pharmacieId } : c,
      ),
      inscriptionsRetirees: s.inscriptionsRetirees.filter((p) => p !== pharmacieId),
    });
    this.simule.rafraichirSession();
    this.journal.consigner('valider', this.nomPharmacie(pharmacieId));
  }

  private refuser(id: string, motif: MotifDecision): void {
    const s = this.stockage;
    const demande = s.demandes.find((d) => d.id === id);
    if (!demande) {
      throw 'introuvable' satisfies ErreurAdmin;
    }
    const precision = motif.precision?.trim() || undefined;
    s.enregistrer({
      demandes: s.demandes.map((d) =>
        d.id === id
          ? { ...d, etat: 'refusee', motifCode: motif.code, motifPrecision: precision }
          : d,
      ),
    });
    const cible = demande.pharmacieId
      ? this.nomPharmacie(demande.pharmacieId)
      : (demande.ajout?.nom ?? id);
    this.journal.consigner('refuser', cible, motif.code);
  }

  private concurrentes(demande: DemandeReclamation): DemandeReclamation[] {
    if (!demande.pharmacieId) {
      return [];
    }
    return this.stockage.demandes.filter(
      (d) =>
        d.id !== demande.id && d.pharmacieId === demande.pharmacieId && d.etat === 'en-attente',
    );
  }

  private detailler(demande: DemandeReclamation): DemandeDetaillee {
    return {
      demande,
      email: this.stockage.comptes.find((c) => c.id === demande.pharmacienId)?.email ?? '',
      pharmacie: demande.pharmacieId ? (this.annuaire.trouver(demande.pharmacieId) ?? null) : null,
    };
  }

  private nomPharmacie(id: string): string {
    return this.annuaire.trouver(id)?.nom ?? id;
  }
}

@Injectable({ providedIn: 'root' })
export class AdminDirectoryServiceSimule implements AdminDirectoryService {
  private readonly stockage = inject(StockageSimulation);
  private readonly annuaire = inject(AnnuaireSimule);
  private readonly retrait = inject(RetraitInscription);
  private readonly journal = inject(AuditLogServiceSimule);

  listerFiches(): Observable<FicheAnnuaire[]> {
    return of(this.fiches());
  }

  obtenirFiche(id: string): Observable<FicheAnnuaire | undefined> {
    const cible = this.annuaire.resoudre(id);
    return of(this.fiches().find((f) => f.id === cible));
  }

  modifierFiche(id: string, champs: ChampsFiche): Observable<void> {
    return action(() => {
      const fiche = this.exiger(id);
      const position = {
        latitude: champs.latitude ?? fiche.latitude,
        longitude: champs.longitude ?? fiche.longitude,
      };
      if (!dansTunisie(position)) {
        throw 'hors-tunisie' satisfies ErreurAdmin;
      }
      this.appliquer(id, champs);
      this.journal.consigner('corriger', fiche.nom, Object.keys(champs).join(', '));
    });
  }

  marquerFermee(id: string, fermee: boolean): Observable<void> {
    return action(() => {
      const fiche = this.exiger(id);
      if (fermee && fiche.etat === 'inscrite') {
        this.retrait.retirer(id, { code: 'pharmacie-fermee' });
      }
      this.appliquer(id, { fermee });
      this.journal.consigner(fermee ? 'fermer' : 'rouvrir', fiche.nom);
    });
  }

  fusionner(gardeeId: string, retireeId: string, champs: ChampsFiche): Observable<void> {
    return action(() => {
      const gardee = this.exiger(gardeeId);
      const retiree = this.exiger(retireeId);
      if (gardeeId === retireeId) {
        throw 'introuvable' satisfies ErreurAdmin;
      }
      if (gardee.etat === 'inscrite' && retiree.etat === 'inscrite') {
        throw 'deux-inscrites' satisfies ErreurAdmin;
      }
      const s = this.stockage;
      const reprendre = (id: string) => (id === retireeId ? gardeeId : id);
      s.enregistrer({
        demandes: s.demandes.map((d) =>
          d.pharmacieId ? { ...d, pharmacieId: reprendre(d.pharmacieId) } : d,
        ),
        comptes: s.comptes.map((c) =>
          c.pharmacieId === retireeId ? { ...c, pharmacieId: gardeeId } : c,
        ),
        stocksDeclares: s.stocksDeclares.map((d) => ({
          ...d,
          pharmacieId: reprendre(d.pharmacieId),
        })),
        suivis: s.suivis.map((c) => c.replace(`${retireeId}|`, `${gardeeId}|`)),
        fusions: { ...s.fusions, [retireeId]: gardeeId },
      });
      this.appliquer(gardeeId, {
        ...champs,
        ...(retiree.etat === 'inscrite' ? { etat: 'inscrite' } : {}),
      });
      this.journal.consigner('fusionner', gardee.nom, `fiche ${retireeId} retirée`);
    });
  }

  retirerInscription(id: string, motif: MotifDecision): Observable<void> {
    return action(() => {
      const fiche = this.exiger(id);
      if (fiche.etat !== 'inscrite') {
        throw 'non-inscrite' satisfies ErreurAdmin;
      }
      if (!motif.code) {
        throw 'motif-requis' satisfies ErreurAdmin;
      }
      this.retrait.retirer(id, motif);
      this.journal.consigner('retirer-inscription', fiche.nom, motif.code);
    });
  }

  private exiger(id: string): Pharmacie {
    const fiche = this.annuaire.toutes().find((p) => p.id === id);
    if (!fiche) {
      throw 'introuvable' satisfies ErreurAdmin;
    }
    return fiche;
  }

  private appliquer(id: string, champs: Partial<Pharmacie>): void {
    const s = this.stockage;
    s.enregistrer({ fiches: { ...s.fiches, [id]: { ...s.fiches[id], ...champs } } });
  }

  /** Doublon probable : même téléphone, ou même nom et même ville une fois normalisés. */
  private fiches(): FicheAnnuaire[] {
    const toutes = this.annuaire.toutes();
    const chiffres = (t: string) => t.replace(/\D/g, '');
    const cleNom = (p: Pharmacie) => `${normaliser(p.nom)}|${normaliser(p.ville)}`;
    return toutes.map((fiche) => ({
      ...fiche,
      doublons: toutes
        .filter(
          (autre) =>
            autre.id !== fiche.id &&
            ((chiffres(fiche.telephone) && chiffres(fiche.telephone) === chiffres(autre.telephone)) ||
              cleNom(fiche) === cleNom(autre)),
        )
        .map((autre) => autre.id),
    }));
  }
}

@Injectable({ providedIn: 'root' })
export class AdminAbuseServiceSimule implements AdminAbuseService {
  private readonly stockage = inject(StockageSimulation);
  private readonly annuaire = inject(AnnuaireSimule);
  private readonly retrait = inject(RetraitInscription);
  private readonly simule = inject(AuthServiceSimule);
  private readonly journal = inject(AuditLogServiceSimule);

  listerSignalements() {
    return of(this.stockage.signalements);
  }

  listerComptes(): Observable<ComptePharmacien[]> {
    return of(
      this.stockage.comptes
        .filter((c) => c.role === 'pharmacien')
        .map((c) => ({
          id: c.id,
          email: c.email,
          compteVerifie: !!c.compteVerifie,
          suspendu: !!c.suspendu,
          pharmacie: c.pharmacieId ? (this.annuaire.trouver(c.pharmacieId)?.nom ?? null) : null,
        })),
    );
  }

  suspendre(compteId: string): Observable<void> {
    return action(() => this.changerSuspension(compteId, true));
  }

  retablir(compteId: string): Observable<void> {
    return action(() => this.changerSuspension(compteId, false));
  }

  supprimerCompte(compteId: string): Observable<void> {
    return action(() => {
      const s = this.stockage;
      const compte = s.comptes.find((c) => c.id === compteId);
      if (!compte || compte.role === 'administrateur') {
        throw 'introuvable' satisfies ErreurAdmin;
      }
      if (compte.pharmacieId) {
        this.retrait.retirer(compte.pharmacieId, { code: 'compte-supprime' });
      }
      s.enregistrer({
        comptes: s.comptes.filter((c) => c.id !== compteId),
        alertes: s.alertes.filter((a) => a.utilisateurId !== compteId),
        demandes: s.demandes.filter((d) => d.pharmacienId !== compteId),
      });
      this.journal.consigner('supprimer-compte', nomCompte(compteId));
    });
  }

  private changerSuspension(compteId: string, suspendu: boolean): void {
    const s = this.stockage;
    if (!s.comptes.some((c) => c.id === compteId && c.role === 'pharmacien')) {
      throw 'introuvable' satisfies ErreurAdmin;
    }
    s.enregistrer({
      comptes: s.comptes.map((c) => (c.id === compteId ? { ...c, suspendu } : c)),
    });
    this.simule.rafraichirSession();
    this.journal.consigner(suspendu ? 'suspendre' : 'retablir', nomCompte(compteId));
  }
}

/** Fournis sur les routes d'administration : pour le back-end, seule cette liste changera. */
export function fournirAdministration(): Provider[] {
  return [
    { provide: ADMIN_AUTH_SERVICE, useExisting: AdminAuthServiceSimule },
    { provide: AUDIT_LOG_SERVICE, useExisting: AuditLogServiceSimule },
    { provide: ADMIN_CLAIM_SERVICE, useExisting: AdminClaimServiceSimule },
    { provide: ADMIN_DIRECTORY_SERVICE, useExisting: AdminDirectoryServiceSimule },
    { provide: ADMIN_ABUSE_SERVICE, useExisting: AdminAbuseServiceSimule },
  ];
}
