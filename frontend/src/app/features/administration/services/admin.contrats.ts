import { InjectionToken, Signal } from '@angular/core';
import { Observable } from 'rxjs';
import {
  DemandeReclamation,
  MotifRefus,
  Pharmacie,
  Signalement,
  Utilisateur,
} from '../../../core/models';

/** Motif visible par le pharmacien : un code traduit, plus une précision libre facultative. */
export interface MotifDecision {
  code: MotifRefus;
  precision?: string;
}

export type ChampsFiche = Partial<
  Pick<
    Pharmacie,
    | 'nom'
    | 'adresse'
    | 'ville'
    | 'gouvernorat'
    | 'telephone'
    | 'horaires'
    | 'latitude'
    | 'longitude'
  >
>;

export type NouvelleFiche = Required<
  Pick<Pharmacie, 'nom' | 'adresse' | 'ville' | 'gouvernorat' | 'telephone' | 'latitude' | 'longitude'>
>;

export interface DemandeDetaillee {
  demande: DemandeReclamation;
  email: string;
  pharmacie: Pharmacie | null;
}

export interface FicheAnnuaire extends Pharmacie {
  /** Identifiants des fiches qui semblent décrire la même pharmacie. */
  doublons: string[];
}

export interface ComptePharmacien {
  id: string;
  email: string;
  compteVerifie: boolean;
  suspendu: boolean;
  pharmacie: string | null;
}

export type ErreurAdmin =
  | 'introuvable'
  | 'motif-requis'
  | 'deja-inscrite'
  | 'deux-inscrites'
  | 'hors-tunisie'
  | 'non-inscrite'
  /** L'API ne sait pas encore faire cette action (Partie 9e). */
  | 'indisponible';

export type ActionJournal =
  | 'valider'
  | 'refuser'
  | 'creer-fiche'
  | 'corriger'
  | 'fermer'
  | 'rouvrir'
  | 'fusionner'
  | 'retirer-inscription'
  | 'suspendre'
  | 'retablir'
  | 'supprimer-compte';

/** Jamais l'e-mail du compte visé : un identifiant suffit et reste lisible après suppression. */
export interface EntreeJournal {
  id: string;
  date: string;
  administrateur: string;
  action: ActionJournal;
  cible: string;
  detail?: string;
}

export interface AdminAuthService {
  readonly administrateur: Signal<Utilisateur | null>;
}

export interface AuditLogService {
  lister(): Observable<EntreeJournal[]>;
  consigner(action: ActionJournal, cible: string, detail?: string): void;
}

export interface AdminClaimService {
  /** Demandes en attente, les plus anciennes d'abord. */
  listerDemandes(): Observable<DemandeDetaillee[]>;
  /** La demande et celles qui visent la même pharmacie. */
  obtenirDossier(id: string): Observable<DemandeDetaillee[]>;
  /** Inscrit la pharmacie et vérifie le compte. S'il y a des concurrentes, `motifAutres` est requis. */
  validerDemande(id: string, motifAutres?: MotifDecision): Observable<void>;
  refuserDemande(id: string, motif: MotifDecision): Observable<void>;
  /** Demande d'ajout : crée la fiche, puis valide. */
  creerFicheEtValider(id: string, fiche: NouvelleFiche): Observable<void>;
}

export interface AdminDirectoryService {
  listerFiches(): Observable<FicheAnnuaire[]>;
  obtenirFiche(id: string): Observable<FicheAnnuaire | undefined>;
  modifierFiche(id: string, champs: ChampsFiche): Observable<void>;
  /** Une pharmacie inscrite perd aussi son inscription. Réversible pour la fiche seulement. */
  marquerFermee(id: string, fermee: boolean): Observable<void>;
  /** `champs` : valeurs reprises de la fiche retirée. Refusé si les deux fiches sont inscrites. */
  fusionner(gardeeId: string, retireeId: string, champs: ChampsFiche): Observable<void>;
  retirerInscription(id: string, motif: MotifDecision): Observable<void>;
}

export interface AdminAbuseService {
  listerSignalements(): Observable<Signalement[]>;
  listerComptes(): Observable<ComptePharmacien[]>;
  suspendre(compteId: string): Observable<void>;
  retablir(compteId: string): Observable<void>;
  supprimerCompte(compteId: string): Observable<void>;
}

export const ADMIN_AUTH_SERVICE = new InjectionToken<AdminAuthService>('ADMIN_AUTH_SERVICE');
export const AUDIT_LOG_SERVICE = new InjectionToken<AuditLogService>('AUDIT_LOG_SERVICE');
export const ADMIN_CLAIM_SERVICE = new InjectionToken<AdminClaimService>('ADMIN_CLAIM_SERVICE');
export const ADMIN_DIRECTORY_SERVICE = new InjectionToken<AdminDirectoryService>(
  'ADMIN_DIRECTORY_SERVICE',
);
export const ADMIN_ABUSE_SERVICE = new InjectionToken<AdminAbuseService>('ADMIN_ABUSE_SERVICE');
