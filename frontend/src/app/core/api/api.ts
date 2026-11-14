import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { InjectionToken } from '@angular/core';
import { environment } from '../../../environments/environment';
import { Medicament, Pharmacie, PlageHoraire, Stock, StatutDeclare } from '../models';

/** Adresse de l'API : « /api » en production (même origine), http://localhost:3000/api en développement. */
export const API_URL = new InjectionToken<string>('API_URL', { factory: () => environment.apiUrl });

function lireCookie(nom: string): string | null {
  const ligne = document.cookie.split('; ').find((c) => c.startsWith(`${nom}=`));
  return ligne ? decodeURIComponent(ligne.slice(nom.length + 1)) : null;
}

/**
 * Appels vers l'API : cookies de session envoyés (withCredentials) et jeton CSRF recopié du cookie XSRF-TOKEN
 * dans l'en-tête X-XSRF-TOKEN sur les écritures. L'intercepteur d'Angular ne le fait pas pour une adresse
 * absolue (développement : autre port).
 */
export const intercepteurApi: HttpInterceptorFn = (req, suite) => {
  if (!req.url.startsWith(environment.apiUrl)) return suite(req);
  let r = req.clone({ withCredentials: true });
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const jeton = lireCookie('XSRF-TOKEN');
    if (jeton) r = r.clone({ setHeaders: { 'X-XSRF-TOKEN': jeton } });
  }
  return suite(r);
};

/** Code d'erreur de l'API (« identifiants », « lien-expire »…), « reseau » sans réponse, sinon « indisponible ». */
export function codeErreur(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    // 0 : pas de réponse ; 502 à 504 : le proxy de développement (ou un relais) n'atteint pas le back-end,
    // par exemple pendant son redémarrage. Ce n'est pas une erreur de l'API : « le serveur ne répond pas ».
    if (e.status === 0 || (e.status >= 502 && e.status <= 504)) return 'reseau';
    const code = (e.error as { erreur?: unknown } | null)?.erreur;
    return typeof code === 'string' ? code : 'indisponible';
  }
  return typeof e === 'string' ? e : 'indisponible';
}

export function statutHttp(e: unknown): number {
  return e instanceof HttpErrorResponse ? e.status : -1;
}

// ---------------------------------------------------------------- formes de l'API

export interface PharmacieApiForme {
  id: string;
  nom: string;
  rue?: string | null;
  quartier?: string | null;
  ville?: string | null;
  codePostal?: string | null;
  gouvernorat?: { code: number; nom: string } | string | null;
  telephone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  etat?: string;
  horaires?: { jour: number; ouverture: string; fermeture: string }[];
  sourceOpenStreetMap?: boolean;
}

export interface MedicamentApiForme {
  id: string;
  nomCommercial: string;
  dci: string;
  forme: string | null;
  dosage: string | null;
  categorie: string | null;
  nomAr: string | null;
  dciAr: string | null;
  donneeTest?: boolean;
}

/** Horaires de l'API (une ligne par jour) regroupés en plages (mêmes heures, plusieurs jours). */
function plages(horaires: PharmacieApiForme['horaires']): PlageHoraire[] {
  const groupes = new Map<string, PlageHoraire>();
  for (const h of horaires ?? []) {
    const cle = `${h.ouverture}-${h.fermeture}`;
    const g = groupes.get(cle) ?? { jours: [], ouverture: h.ouverture, fermeture: h.fermeture };
    g.jours.push(h.jour);
    groupes.set(cle, g);
  }
  return [...groupes.values()].map((g) => ({ ...g, jours: [...new Set(g.jours)].sort((a, b) => a - b) }));
}

export function versPharmacie(p: PharmacieApiForme): Pharmacie {
  const etat = p.etat === 'inscrite' || p.etat === 'reclamee' ? p.etat : 'non-inscrite';
  return {
    id: p.id,
    nom: p.nom,
    adresse: [p.rue, p.quartier].filter((x) => !!x).join(', '),
    ville: p.ville ?? '',
    ...(p.codePostal ? { codePostal: p.codePostal } : {}),
    gouvernorat: typeof p.gouvernorat === 'string' ? p.gouvernorat : (p.gouvernorat?.nom ?? ''),
    telephone: p.telephone ?? '',
    horaires: plages(p.horaires),
    latitude: p.latitude ?? 0,
    longitude: p.longitude ?? 0,
    etat,
    source: p.sourceOpenStreetMap ? 'openstreetmap' : 'annuaire',
  };
}

export function versMedicament(m: MedicamentApiForme): Medicament {
  return {
    id: m.id,
    nom: m.nomCommercial,
    dci: m.dci,
    forme: m.forme ?? '',
    dosage: m.dosage ?? '',
    ...(m.categorie ? { categorie: m.categorie } : {}),
    ...(m.nomAr ? { nomArabe: m.nomAr } : {}),
    ...(m.dciAr ? { dciArabe: m.dciAr } : {}),
    ...(m.donneeTest ? { donneeTest: true } : {}),
  };
}

export function versStock(pharmacieId: string, medicamentId: string, statut: string, declareLe: string): Stock {
  return { pharmacieId, medicamentId, statutDeclare: statut as StatutDeclare, declareLe };
}

/** Gouvernorats du front (core/gouvernorats.ts) et codes de la base (migration 004). */
export const CODES_GOUVERNORATS: Record<string, number> = {
  Tunis: 11, Ariana: 12, 'Ben Arous': 13, Manouba: 14, Nabeul: 21, Zaghouan: 22, Bizerte: 23,
  Béja: 31, Jendouba: 32, Kef: 33, Siliana: 34, Kairouan: 41, Kasserine: 42, 'Sidi Bouzid': 43,
  Sousse: 51, Monastir: 52, Mahdia: 53, Sfax: 61, Gafsa: 71, Tozeur: 72, Kébili: 73,
  Gabès: 81, Médenine: 82, Tataouine: 83,
};

export function nomGouvernorat(code: number | null | undefined): string | null {
  if (code === null || code === undefined) return null;
  return Object.entries(CODES_GOUVERNORATS).find(([, c]) => c === code)?.[0] ?? null;
}
