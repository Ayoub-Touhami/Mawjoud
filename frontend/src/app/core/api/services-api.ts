import { HttpClient } from '@angular/common/http';
import { computed, inject, Injectable } from '@angular/core';
import { catchError, EMPTY, expand, map, Observable, of, reduce, shareReplay, switchMap, tap, throwError } from 'rxjs';
import {
  Alerte, DemandeReclamation, Justificatif, Medicament, Pharmacie, PharmacieProposee, Role, StatutDeclare, Stock, Utilisateur,
} from '../models';
import { AlertService, CreationAlerte, ErreurAlerte } from '../services/alert.service';
import { AuthService, ErreurAuth } from '../services/auth.service';
import { ClaimService, ErreurReclamation } from '../services/claim.service';
import { ContactService, ErreurContact, MessageContact } from '../services/contact.service';
import { PharmacieApi } from '../services/pharmacie-api';
import { PharmacistAuthService } from '../services/pharmacist-auth.service';
import { SessionService } from '../services/session.service';
import { ErreurStock, EvaluateurAlertes, StockService } from '../services/stock.service';
import {
  API_URL, CODES_GOUVERNORATS, codeErreur, MedicamentApiForme, nomGouvernorat, PharmacieApiForme, statutHttp, versMedicament,
  versPharmacie, versStock,
} from './api';

interface Page<T> { elements: T[]; page?: number; taille?: number; total?: number }

/** Toutes les pages d'une liste paginée (50 par page, 100 pages au plus). */
function toutesLesPages<T>(http: HttpClient, url: string, params: Record<string, string | number> = {}): Observable<T[]> {
  const lire = (page: number) => http.get<Page<T>>(url, { params: { ...params, page, taille: 50 } });
  return lire(1).pipe(
    expand((r) => {
      const page = r.page ?? 1;
      return r.total !== undefined && page * 50 < r.total && page < 100 ? lire(page + 1) : EMPTY;
    }),
    reduce((tout, r) => [...tout, ...r.elements], [] as T[]),
  );
}

const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// ---------------------------------------------------------------- public : pharmacies et médicaments

@Injectable({ providedIn: 'root' })
export class PharmacieApiHttp implements PharmacieApi {
  private readonly http = inject(HttpClient);
  private readonly url = inject(API_URL);
  private readonly session = inject(SessionService);
  /** Pharmacies déjà reçues (listes, disponibilités) : une fiche ouverte ensuite ne refait pas d'appel inutile. */
  readonly connues = new Map<string, Pharmacie>();
  private catalogue$?: Observable<Medicament[]>;

  memoriser(p: Pharmacie): Pharmacie {
    this.connues.set(p.id, p);
    return p;
  }

  listerPharmacies(ville?: string): Observable<Pharmacie[]> {
    return toutesLesPages<PharmacieApiForme>(this.http, `${this.url}/v1/pharmacies`, ville ? { ville } : {}).pipe(
      map((l) => l.map((p) => this.memoriser(versPharmacie(p)))),
    );
  }

  obtenirPharmacie(id: string): Observable<Pharmacie | undefined> {
    return this.http.get<PharmacieApiForme>(`${this.url}/v1/pharmacies/${encodeURIComponent(id)}`).pipe(
      map((p) => this.memoriser(versPharmacie(p))),
      catchError((e) => (statutHttp(e) === 404 || statutHttp(e) === 400 ? this.fichePharmacien(id) : throwError(() => e))),
    );
  }

  /** Pharmacie non publiée : seul son pharmacien la voit (espace pharmacien), avec ce que son API renvoie. */
  private fichePharmacien(id: string): Observable<Pharmacie | undefined> {
    const u = this.session.utilisateur();
    if (u?.role !== 'pharmacien' || u.pharmacieId !== id) return of(undefined);
    return this.http.get<Page<{ id: string; nom: string }>>(`${this.url}/v1/pharmacien/pharmacies`).pipe(
      map((r) => r.elements.find((p) => p.id === id)),
      map((p) => (p ? versPharmacie({ id: p.id, nom: p.nom, etat: 'inscrite' }) : undefined)),
      catchError(() => of(undefined)),
    );
  }

  listerVilles(): Observable<string[]> {
    return this.http.get<Page<{ nom: string }>>(`${this.url}/v1/villes`).pipe(map((r) => r.elements.map((v) => v.nom)));
  }

  listerMedicaments(): Observable<Medicament[]> {
    this.catalogue$ ??= this.http.get<Page<MedicamentApiForme>>(`${this.url}/v1/medicaments/tous`).pipe(
      map((r) => r.elements.map(versMedicament)),
      catchError((e) => {
        this.catalogue$ = undefined;
        return throwError(() => e);
      }),
      shareReplay(1),
    );
    return this.catalogue$;
  }

  obtenirMedicament(id: string): Observable<Medicament | undefined> {
    return this.listerMedicaments().pipe(map((l) => l.find((m) => m.id === id)));
  }

  chercherMedicaments(texte: string): Observable<Medicament[]> {
    const q = texte.trim();
    if (q.length < 2) return of([]);
    return this.http
      .get<Page<MedicamentApiForme>>(`${this.url}/v1/medicaments`, { params: { q: q.slice(0, 100), limite: 20 } })
      .pipe(map((r) => r.elements.map(versMedicament)));
  }

  /** Noms qui commencent comme la saisie (3 premières lettres), quand la recherche ne trouve rien. */
  medicamentsProches(texte: string): Observable<Medicament[]> {
    const debut = sansAccents(texte).slice(0, 3);
    if (debut.length < 2) return of([]);
    return this.listerMedicaments().pipe(
      map((l) => l.filter((m) => sansAccents(m.nom).startsWith(debut) || sansAccents(m.dci).startsWith(debut)).slice(0, 8)),
    );
  }
}

// ---------------------------------------------------------------- disponibilités

interface DisponibilitePharmacien { medicament: { id: string }; statut: string; declareLe: string }

@Injectable({ providedIn: 'root' })
export class StockServiceHttp implements StockService {
  private readonly http = inject(HttpClient);
  private readonly url = inject(API_URL);
  private readonly session = inject(SessionService);
  private readonly pharmacies = inject(PharmacieApiHttp);

  private estMaPharmacie(id: string): boolean {
    const u = this.session.utilisateur();
    return u?.role === 'pharmacien' && u.pharmacieId === id;
  }

  private erreur = (e: unknown) =>
    throwError(() => ([401, 403, 404].includes(statutHttp(e)) ? 'non-autorise' : 'reseau') satisfies ErreurStock);

  stocksDePharmacie(pharmacieId: string): Observable<Stock[]> {
    if (this.estMaPharmacie(pharmacieId)) {
      return toutesLesPages<DisponibilitePharmacien>(this.http, `${this.url}/v1/pharmacien/pharmacies/${pharmacieId}/disponibilites`).pipe(
        map((l) => l.map((d) => versStock(pharmacieId, d.medicament.id, d.statut, d.declareLe))),
        catchError(this.erreur),
      );
    }
    return this.http
      .get<Page<{ medicamentId: string; statut: string; declareLe: string }>>(`${this.url}/v1/pharmacies/${pharmacieId}/disponibilites`)
      .pipe(
        map((r) => r.elements.map((d) => versStock(pharmacieId, d.medicamentId, d.statut, d.declareLe))),
        catchError((e) => (statutHttp(e) === 404 ? of([]) : this.erreur(e))),
      );
  }

  stocksDeMedicament(medicamentId: string): Observable<Stock[]> {
    return this.http
      .get<Page<{ pharmacie: PharmacieApiForme; statut: string; declareLe: string }>>(
        `${this.url}/v1/medicaments/${medicamentId}/pharmacies`, { params: { limite: 50 } })
      .pipe(
        map((r) => r.elements.map((d) => {
          this.pharmacies.memoriser(versPharmacie(d.pharmacie));
          return versStock(d.pharmacie.id, medicamentId, d.statut, d.declareLe);
        })),
        catchError((e) => (statutHttp(e) === 404 ? of([]) : this.erreur(e))),
      );
  }

  medicamentsSuivis(pharmacieId: string): Observable<string[]> {
    return this.http.get<Page<string | { id?: string; medicament?: { id: string } }>>(
      `${this.url}/v1/pharmacien/pharmacies/${pharmacieId}/suivis`).pipe(
      map((r) => r.elements.map((s) => (typeof s === 'string' ? s : (s.medicament?.id ?? s.id ?? '')))),
      catchError(this.erreur),
    );
  }

  suivreMedicament(pharmacieId: string, medicamentId: string): Observable<void> {
    return this.http.put<unknown>(`${this.url}/v1/pharmacien/pharmacies/${pharmacieId}/suivis/${medicamentId}`, {}).pipe(
      map(() => undefined), catchError(this.erreur));
  }

  retirerMedicament(pharmacieId: string, medicamentId: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/v1/pharmacien/pharmacies/${pharmacieId}/disponibilites/${medicamentId}`).pipe(
      map(() => undefined), catchError(this.erreur));
  }

  declarer(pharmacieId: string, medicamentId: string, statut: StatutDeclare): Observable<Stock> {
    return this.http
      .put<{ statut: string; declareLe: string }>(`${this.url}/v1/pharmacien/pharmacies/${pharmacieId}/disponibilites/${medicamentId}`, { statut })
      .pipe(map((d) => versStock(pharmacieId, medicamentId, d.statut ?? statut, d.declareLe ?? new Date().toISOString())), catchError(this.erreur));
  }

  confirmerTout(pharmacieId: string): Observable<Stock[]> {
    return this.http.post<unknown>(`${this.url}/v1/pharmacien/pharmacies/${pharmacieId}/disponibilites/confirmer-tout`, {}).pipe(
      switchMap(() => this.stocksDePharmacie(pharmacieId)),
      catchError(this.erreur),
    );
  }
}

/** Les alertes sont évaluées par le serveur après chaque déclaration (Partie 9b) : rien à faire ici. */
@Injectable({ providedIn: 'root' })
export class EvaluateurAlertesServeur implements EvaluateurAlertes {
  evaluer(): void {}
}

// ---------------------------------------------------------------- comptes

@Injectable({ providedIn: 'root' })
export class AuthServiceHttp implements AuthService {
  private readonly http = inject(HttpClient);
  private readonly url = inject(API_URL);
  private readonly session = inject(SessionService);
  readonly utilisateur = this.session.utilisateur;

  /** Au démarrage : reprend la session ouverte (cookie), sans erreur s'il n'y en a pas. */
  restaurer(): Observable<void> {
    return this.http.get<Utilisateur>(`${this.url}/comptes/moi`).pipe(
      tap((u) => this.session.ouvrir(u)),
      map(() => undefined),
      catchError(() => of(undefined)),
    );
  }

  private erreurAuth(e: unknown, defaut: ErreurAuth = 'indisponible'): Observable<never> {
    const code = codeErreur(e);
    const connus: ErreurAuth[] = ['identifiants', 'lien-expire', 'lien-invalide', 'non-connecte'];
    return throwError(() => (connus.includes(code as ErreurAuth) ? code : defaut));
  }

  /** Inscription (réponse toujours identique), puis connexion. Si la connexion échoue, l'adresse avait déjà un compte. */
  creerCompte(email: string, motDePasse: string, role: Role = 'patient'): Observable<Utilisateur> {
    const route = role === 'pharmacien' ? 'pharmaciens' : 'patients';
    return this.http.post(`${this.url}/comptes/${route}`, { email, motDePasse }).pipe(
      catchError((e) => this.erreurAuth(e)),
      switchMap(() => this.seConnecter(email, motDePasse).pipe(
        catchError((e) => throwError(() => (e === 'identifiants' ? 'email-utilise' : e) as ErreurAuth)),
      )),
    );
  }

  seConnecter(email: string, motDePasse: string): Observable<Utilisateur> {
    return this.http.post<Utilisateur>(`${this.url}/comptes/connexion`, { email, motDePasse }).pipe(
      tap((u) => this.session.ouvrir(u)),
      catchError((e) => this.erreurAuth(e)),
    );
  }

  seDeconnecter(): void {
    this.http.post(`${this.url}/comptes/deconnexion`, {}).subscribe({ error: () => undefined });
    this.session.fermer();
  }

  verifierEmail(jeton: string): Observable<void> {
    return this.http.post<void>(`${this.url}/comptes/verification-email`, { jeton }).pipe(
      switchMap(() => (this.session.connecte() ? this.restaurer() : of(undefined))),
      catchError((e) => this.erreurAuth(e, 'lien-invalide')),
    );
  }

  renvoyerLien(jetonExpire?: string): Observable<void> {
    return this.http.post<void>(`${this.url}/comptes/verification-email/renvoi`, jetonExpire ? { jetonExpire } : {}).pipe(
      map(() => undefined),
      catchError((e) => this.erreurAuth(e)),
    );
  }

  /** Pas encore de route de suppression de compte dans l'API (STATUT.md). */
  supprimerCompte(): Observable<void> {
    return throwError(() => 'indisponible' satisfies ErreurAuth);
  }
}

@Injectable({ providedIn: 'root' })
export class PharmacistAuthServiceHttp implements PharmacistAuthService {
  private readonly auth = inject(AuthServiceHttp);
  private readonly session = inject(SessionService);
  readonly pharmacien = computed(() => {
    const u = this.session.utilisateur();
    return u?.role === 'pharmacien' ? u : null;
  });
  readonly peutDeclarer = computed(() => {
    const u = this.pharmacien();
    return !!u && u.emailVerifie && !!u.compteVerifie && !!u.pharmacieId && !u.suspendu;
  });

  creerCompte(email: string, motDePasse: string): Observable<Utilisateur> {
    return this.auth.creerCompte(email, motDePasse, 'pharmacien');
  }
}

// ---------------------------------------------------------------- alertes

interface AlerteApi {
  id: string;
  etat: 'active' | 'terminee';
  gouvernorat: { code: number; nom: string } | null;
  medicament: { id: string };
  declencheeLe?: string | null;
}

@Injectable({ providedIn: 'root' })
export class AlertServiceHttp implements AlertService {
  private readonly http = inject(HttpClient);
  private readonly url = inject(API_URL);
  private readonly session = inject(SessionService);

  private versAlerte = (a: AlerteApi): Alerte => ({
    id: a.id,
    utilisateurId: this.session.utilisateur()?.id ?? '',
    medicamentId: a.medicament.id,
    ville: nomGouvernorat(a.gouvernorat?.code),
    etat: a.etat,
    ...(a.declencheeLe ? { declencheeLe: a.declencheeLe } : {}),
  });

  private erreur(e: unknown): Observable<never> {
    const code = codeErreur(e);
    const valeur: ErreurAlerte =
      statutHttp(e) === 401 ? 'non-connecte' : code === 'doublon' ? 'doublon' : code === 'lien-invalide' ? 'lien-invalide' : 'introuvable';
    return throwError(() => valeur);
  }

  listerAlertes(): Observable<Alerte[]> {
    return this.http.get<Page<AlerteApi>>(`${this.url}/v1/alertes`).pipe(
      map((r) => r.elements.map(this.versAlerte)), catchError((e) => this.erreur(e)));
  }

  creerAlerte(medicamentId: string, ville: string | null): Observable<CreationAlerte> {
    const gouvernorat = ville ? (CODES_GOUVERNORATS[ville] ?? null) : null;
    return this.http
      .post<{ alerte: AlerteApi; existante: boolean }>(`${this.url}/v1/alertes`, { medicamentId, gouvernorat, consentement: true })
      .pipe(map((r) => ({ alerte: this.versAlerte(r.alerte), existante: r.existante })), catchError((e) => this.erreur(e)));
  }

  modifierAlerte(id: string, ville: string | null): Observable<Alerte> {
    const gouvernorat = ville ? (CODES_GOUVERNORATS[ville] ?? null) : null;
    return this.http.patch<AlerteApi>(`${this.url}/v1/alertes/${id}`, { gouvernorat }).pipe(
      map(this.versAlerte), catchError((e) => this.erreur(e)));
  }

  supprimerAlerte(id: string): Observable<void> {
    return this.http.delete<void>(`${this.url}/v1/alertes/${id}`).pipe(map(() => undefined), catchError((e) => this.erreur(e)));
  }

  desabonner(jeton: string): Observable<void> {
    return this.http.post<unknown>(`${this.url}/v1/alertes/desabonnement`, { jeton }).pipe(
      map(() => undefined), catchError((e) => this.erreur(e)));
  }
}

// ---------------------------------------------------------------- réclamation d'une pharmacie

@Injectable({ providedIn: 'root' })
export class ClaimServiceHttp implements ClaimService {
  private readonly http = inject(HttpClient);
  private readonly url = inject(API_URL);

  private erreur(e: unknown): Observable<never> {
    const code = codeErreur(e);
    const valeur: ErreurReclamation =
      statutHttp(e) === 401 ? 'non-connecte' : code === 'demande-en-cours' || code === 'deja-rattache' ? 'demande-en-cours' : 'introuvable';
    return throwError(() => valeur);
  }

  chercherPharmacies(texte: string): Observable<Pharmacie[]> {
    const q = texte.trim();
    if (q.length < 2) return of([]);
    return this.http.get<Page<PharmacieApiForme>>(`${this.url}/pharmacien/rattachement/recherche`, { params: { q: q.slice(0, 100) } }).pipe(
      map((r) => r.elements.map(versPharmacie)), catchError((e) => this.erreur(e)));
  }

  maDemande(): Observable<DemandeReclamation | null> {
    return this.http.get<DemandeReclamation | null>(`${this.url}/pharmacien/rattachement`).pipe(
      map((d) => d ?? null), catchError((e) => this.erreur(e)));
  }

  reclamer(pharmacieId: string, justificatif: Justificatif): Observable<DemandeReclamation> {
    return this.http.post<DemandeReclamation>(`${this.url}/pharmacien/rattachement`, { pharmacieId, justificatif }).pipe(
      catchError((e) => this.erreur(e)));
  }

  demanderAjout(pharmacie: PharmacieProposee, justificatif: Justificatif): Observable<DemandeReclamation> {
    return this.http.post<DemandeReclamation>(`${this.url}/pharmacien/rattachement`, { ajout: pharmacie, justificatif }).pipe(
      catchError((e) => this.erreur(e)));
  }
}

/** Le formulaire de contact n'a pas encore de route dans l'API (STATUT.md) : l'envoi échoue proprement. */
@Injectable({ providedIn: 'root' })
export class ContactServiceIndisponible implements ContactService {
  envoyer(_message: MessageContact): Observable<void> {
    return throwError(() => 'reseau' satisfies ErreurContact);
  }
}
