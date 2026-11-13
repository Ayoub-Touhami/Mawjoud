import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable, Provider } from '@angular/core';
import { catchError, EMPTY, expand, map, Observable, of, reduce, shareReplay, switchMap, throwError } from 'rxjs';
import { API_URL, CODES_GOUVERNORATS, codeErreur, nomGouvernorat, statutHttp } from '../../../core/api/api';
import { DemandeReclamation, Pharmacie, Signalement } from '../../../core/models';
import { SessionService } from '../../../core/services/session.service';
import {
  ActionJournal, ADMIN_ABUSE_SERVICE, ADMIN_AUTH_SERVICE, ADMIN_CLAIM_SERVICE, ADMIN_DIRECTORY_SERVICE, AdminAbuseService,
  AdminAuthService, AdminClaimService, AdminDirectoryService, AUDIT_LOG_SERVICE, AuditLogService, ChampsFiche, ComptePharmacien,
  DemandeDetaillee, EntreeJournal, ErreurAdmin, FicheAnnuaire, MotifDecision, NouvelleFiche,
} from './admin.contrats';

/**
 * Administration branchée sur l'API (Partie 9e), mêmes contrats que admin.simule.ts. Ce que l'API ne sait pas
 * encore faire (adresse, horaires ou position d'une fiche, retrait d'inscription, signalements, suppression
 * de compte) répond « indisponible » (STATUT.md).
 */
interface Page<T> { elements: T[]; page?: number; total?: number }

function toutesLesPages<T>(http: HttpClient, url: string, params: Record<string, string | number> = {}): Observable<T[]> {
  const lire = (page: number) => http.get<Page<T>>(url, { params: { ...params, page, taille: 50 } });
  return lire(1).pipe(
    expand((r) => ((r.page ?? 1) * 50 < (r.total ?? 0) && (r.page ?? 1) < 100 ? lire((r.page ?? 1) + 1) : EMPTY)),
    reduce((tout, r) => [...tout, ...r.elements], [] as T[]),
  );
}

const indisponible = () => throwError(() => 'indisponible' as ErreurAdmin);
const erreurAdmin = (e: unknown) =>
  throwError(() => (statutHttp(e) === 404 ? 'introuvable' : codeErreur(e) === 'pharmacie-attribuee' ? 'deja-inscrite' : 'indisponible') as ErreurAdmin);
const vide = () => undefined;

@Injectable({ providedIn: 'root' })
export class AdminAuthServiceApi implements AdminAuthService {
  private readonly session = inject(SessionService);
  readonly administrateur = computed(() => {
    const u = this.session.utilisateur();
    return u?.role === 'administrateur' ? u : null;
  });
}

interface LigneJournal {
  id: string;
  action: string;
  cibleType: string;
  cibleId: string;
  detail: unknown;
  creeLe: string;
  acteur: { email: string | null } | null;
}

const ACTIONS: ActionJournal[] = [
  'valider', 'refuser', 'creer-fiche', 'corriger', 'fermer', 'rouvrir', 'fusionner', 'retirer-inscription', 'suspendre', 'retablir', 'supprimer-compte',
];

/** Le serveur journalise lui-même chaque action : consigner() n'a rien à faire. */
@Injectable({ providedIn: 'root' })
export class AuditLogServiceApi implements AuditLogService {
  private readonly http = inject(HttpClient);
  private readonly url = inject(API_URL);

  lister(): Observable<EntreeJournal[]> {
    return this.http.get<Page<LigneJournal>>(`${this.url}/v1/admin/journal`, { params: { taille: 50 } }).pipe(
      // Seules les actions que la page sait nommer (les connexions, refus d'accès… restent dans l'API).
      map((r) => r.elements.filter((l) => ACTIONS.includes(l.action.replaceAll('_', '-') as ActionJournal)).map((l) => ({
        id: l.id,
        date: l.creeLe,
        administrateur: l.acteur?.email ?? '—',
        action: l.action.replaceAll('_', '-') as ActionJournal,
        cible: `${l.cibleType} ${l.cibleId}`,
        ...(l.detail && Object.keys(l.detail).length ? { detail: JSON.stringify(l.detail) } : {}),
      }))),
      catchError(() => of([])),
    );
  }

  consigner(): void {}
}

type DemandeAdmin = DemandeReclamation & { pharmacienEmail?: string; pharmacieNom?: string | null };

@Injectable({ providedIn: 'root' })
export class AdminClaimServiceApi implements AdminClaimService {
  private readonly http = inject(HttpClient);
  private readonly url = inject(API_URL);

  private detailler = (d: DemandeAdmin): DemandeDetaillee => ({
    demande: d,
    email: d.pharmacienEmail ?? '',
    pharmacie: d.pharmacieId
      ? ({ id: d.pharmacieId, nom: d.pharmacieNom ?? '', adresse: '', ville: '', gouvernorat: '', telephone: '', horaires: [],
          latitude: 0, longitude: 0, etat: 'reclamee', source: 'annuaire' } satisfies Pharmacie)
      : null,
  });

  listerDemandes(): Observable<DemandeDetaillee[]> {
    // Réseau ou serveur indisponible : liste vide plutôt qu'une page cassée (les pages lisent par toSignal).
    return this.http.get<DemandeAdmin[]>(`${this.url}/admin/rattachements`, { params: { etat: 'en-attente' } }).pipe(
      map((l) => l.map(this.detailler)), catchError(() => of([])));
  }

  /** Le dossier : la demande, et les autres demandes en attente sur la même pharmacie. */
  obtenirDossier(id: string): Observable<DemandeDetaillee[]> {
    return this.listerDemandes().pipe(map((l) => {
      const d = l.find((x) => x.demande.id === id);
      if (!d) return [];
      return [d, ...l.filter((x) => x.demande.id !== id && !!d.demande.pharmacieId && x.demande.pharmacieId === d.demande.pharmacieId)];
    }));
  }

  validerDemande(id: string, motifAutres?: MotifDecision): Observable<void> {
    return this.http.post(`${this.url}/admin/rattachements/${id}/valider`, {}).pipe(
      switchMap(() => (motifAutres ? this.refuserAutres(id, motifAutres) : of(undefined))),
      map(vide), catchError(erreurAdmin));
  }

  /** Les autres demandes en attente sur la même pharmacie sont refusées avec le motif donné. */
  private refuserAutres(id: string, motif: MotifDecision): Observable<void> {
    return this.obtenirDossier(id).pipe(
      switchMap((dossier) => {
        const autres = dossier.slice(1).map((d) => d.demande.id);
        return autres.length ? autres.reduce((acc$, autre) => acc$.pipe(switchMap(() => this.refuserDemande(autre, motif))), of(undefined) as Observable<void>) : of(undefined);
      }),
    );
  }

  refuserDemande(id: string, motif: MotifDecision): Observable<void> {
    return this.http.post(`${this.url}/admin/rattachements/${id}/refuser`, {
      motifCode: motif.code.replaceAll('-', '_'), ...(motif.precision ? { motifPrecision: motif.precision } : {}),
    }).pipe(map(vide), catchError(erreurAdmin));
  }

  /** Crée la fiche (en attente de position : la position viendra du pharmacien), puis valide la demande. */
  creerFicheEtValider(id: string, fiche: NouvelleFiche): Observable<void> {
    const gouvernorat = CODES_GOUVERNORATS[fiche.gouvernorat];
    if (!gouvernorat) return throwError(() => 'introuvable' as ErreurAdmin);
    return this.http.post(`${this.url}/v1/admin/pharmacies`, {
      rattachementId: id, nom: fiche.nom, ville: fiche.ville, gouvernorat,
      ...(fiche.adresse ? { rue: fiche.adresse } : {}),
      ...(/^\+216[0-9]{8}$/.test(fiche.telephone) ? { telephone: fiche.telephone } : {}),
      confirmerSansDoublon: true,
    }).pipe(switchMap(() => this.validerDemande(id)), catchError(erreurAdmin));
  }
}

interface FicheApi {
  id: string;
  nom: string | null;
  ville: string | null;
  gouvernorat: number | null;
  statutPublication: string;
  position: { latitude: number; longitude: number; confirmee: boolean } | null;
}

@Injectable({ providedIn: 'root' })
export class AdminDirectoryServiceApi implements AdminDirectoryService {
  private readonly http = inject(HttpClient);
  private readonly url = inject(API_URL);
  private fiches$?: Observable<FicheAnnuaire[]>;

  private versFiche = (f: FicheApi): FicheAnnuaire => ({
    id: f.id, nom: f.nom ?? '', adresse: '', ville: f.ville ?? '', gouvernorat: nomGouvernorat(f.gouvernorat) ?? '',
    telephone: '', horaires: [], latitude: f.position?.latitude ?? 0, longitude: f.position?.longitude ?? 0,
    etat: 'non-inscrite', source: 'annuaire', fermee: f.statutPublication === 'fermee', doublons: [],
  });

  /** Tout l'annuaire (environ 4 000 fiches, 50 par page), gardé jusqu'à la prochaine modification. */
  listerFiches(): Observable<FicheAnnuaire[]> {
    this.fiches$ ??= toutesLesPages<FicheApi>(this.http, `${this.url}/v1/admin/pharmacies`).pipe(
      map((l) => l.filter((f) => f.statutPublication !== 'fusionnee').map(this.versFiche)),
      catchError(() => {
        this.fiches$ = undefined;
        return of([] as FicheAnnuaire[]);
      }),
      shareReplay(1),
    );
    return this.fiches$;
  }

  obtenirFiche(id: string): Observable<FicheAnnuaire | undefined> {
    return this.listerFiches().pipe(map((l) => l.find((f) => f.id === id)));
  }

  private apres<T>(o: Observable<T>): Observable<void> {
    return o.pipe(map(() => {
      this.fiches$ = undefined;
    }), catchError(erreurAdmin));
  }

  /** Seul le nom se corrige par l'API (relu par l'administrateur qui le saisit). */
  modifierFiche(id: string, champs: ChampsFiche): Observable<void> {
    const autres = Object.keys(champs).filter((k) => k !== 'nom');
    if (autres.length || !champs.nom) return indisponible();
    return this.apres(this.http.post(`${this.url}/v1/admin/pharmacies/${id}/nom`, { nom: champs.nom, nomRelu: true }));
  }

  marquerFermee(id: string, fermee: boolean): Observable<void> {
    return this.apres(this.http.post(`${this.url}/v1/admin/pharmacies/${id}/statut`, {
      statut: fermee ? 'fermee' : 'pret-a-publier', motif: fermee ? 'Fermée (administration).' : 'Réouverte (administration).',
    }));
  }

  fusionner(gardeeId: string, retireeId: string, champs: ChampsFiche): Observable<void> {
    const fusion = this.http.post(`${this.url}/v1/admin/pharmacies/${gardeeId}/fusionner`, {
      fusionneeId: retireeId, motif: 'Doublon fusionné depuis l\'annuaire.',
    });
    return this.apres(champs.nom ? fusion.pipe(switchMap(() => this.http.post(`${this.url}/v1/admin/pharmacies/${gardeeId}/nom`, { nom: champs.nom, nomRelu: true }).pipe(catchError(() => of(null))))) : fusion);
  }

  retirerInscription(): Observable<void> {
    return indisponible();
  }
}

interface CompteApi { id: string; email: string; role: string; suspendu: boolean; pharmacie: { id: string; nom: string | null } | null }

@Injectable({ providedIn: 'root' })
export class AdminAbuseServiceApi implements AdminAbuseService {
  private readonly http = inject(HttpClient);
  private readonly url = inject(API_URL);

  /** Pas encore de route de signalement dans l'API : liste vide. */
  listerSignalements(): Observable<Signalement[]> {
    return of([]);
  }

  listerComptes(): Observable<ComptePharmacien[]> {
    return toutesLesPages<CompteApi>(this.http, `${this.url}/v1/admin/comptes`, { role: 'pharmacien' }).pipe(
      map((l) => l.map((c) => ({ id: c.id, email: c.email, compteVerifie: !!c.pharmacie, suspendu: c.suspendu, pharmacie: c.pharmacie?.nom ?? null }))),
      catchError(() => of([])),
    );
  }

  suspendre(compteId: string): Observable<void> {
    return this.http.post(`${this.url}/v1/admin/comptes/${compteId}/suspendre`, { motif: 'Suspendu depuis l\'administration.' }).pipe(map(vide), catchError(erreurAdmin));
  }

  retablir(compteId: string): Observable<void> {
    return this.http.post(`${this.url}/v1/admin/comptes/${compteId}/retablir`, { motif: 'Rétabli depuis l\'administration.' }).pipe(map(vide), catchError(erreurAdmin));
  }

  supprimerCompte(): Observable<void> {
    return indisponible();
  }
}

export function fournirAdministrationApi(): Provider[] {
  return [
    { provide: ADMIN_AUTH_SERVICE, useExisting: AdminAuthServiceApi },
    { provide: AUDIT_LOG_SERVICE, useExisting: AuditLogServiceApi },
    { provide: ADMIN_CLAIM_SERVICE, useExisting: AdminClaimServiceApi },
    { provide: ADMIN_DIRECTORY_SERVICE, useExisting: AdminDirectoryServiceApi },
    { provide: ADMIN_ABUSE_SERVICE, useExisting: AdminAbuseServiceApi },
  ];
}
