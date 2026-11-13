import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseEnv } from 'node:util';

export type Environnement = 'development' | 'production' | 'test';
export type FournisseurEmail = 'console' | 'brevo' | 'memoire';

export interface Limite {
  /** Nombre d'événements autorisés dans la fenêtre. */
  max: number;
  fenetreMs: number;
}

export interface Configuration {
  environnement: Environnement;
  hote: string;
  port: number;
  /** Chaîne de connexion de mawjoud_api : secrète, jamais journalisée. */
  urlBase: string;
  frontUrl: string;
  originesCors: string[];
  fournisseurEmail: FournisseurEmail;
  trustProxy: boolean;
  cookies: { session: string; csrf: string; securise: boolean };
  session: { dureeGlissanteMs: number; dureeMaxMs: number; rafraichirApresMs: number };
  jetons: { verificationMs: number; reinitialisationMs: number };
  limites: {
    connexionParEmail: Limite;
    connexionParIp: Limite;
    envoisParIp: Limite;
    envoisParEmail: Limite;
    /** Routes publiques en lecture (recherche, carte), par IP. */
    publicParIp: Limite;
  };
}

const MINUTE = 60_000;
const HEURE = 60 * MINUTE;
const JOUR = 24 * HEURE;

const BASES_INTERDITES = ['cleanapp', 'postgres', 'template0', 'template1'];
const COMPTES_INTERDITS = ['postgres'];

/**
 * Lit .env à la racine du dépôt ; les variables déjà définies dans la session gardent la priorité.
 * Lecture directe plutôt que process.loadEnvFile, qui ignore l'environnement isolé de Jest.
 */
export function chargerFichierEnv(): void {
  const chemin = process.env.MAWJOUD_ENV_FILE ?? resolve(process.cwd(), '..', '.env');
  if (!existsSync(chemin)) return;
  const valeurs = parseEnv(readFileSync(chemin, 'utf8'));
  for (const [cle, valeur] of Object.entries(valeurs)) {
    if (process.env[cle] === undefined && valeur !== undefined) process.env[cle] = valeur;
  }
}

function entier(nom: string, defaut: number): number {
  const brut = process.env[nom];
  if (brut === undefined || brut === '') return defaut;
  const n = Number(brut);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Configuration : ${nom} doit être un entier positif.`);
  return n;
}

/**
 * Vérifie la chaîne de connexion du back-end sans jamais l'afficher.
 * Refuse le compte postgres et les bases qui ne sont pas celles du projet.
 */
export function verifierUrlBase(url: string | undefined, environnement: Environnement): string {
  if (!url) throw new Error('Configuration : API_DATABASE_URL absente (lancer database/definir-mot-de-passe-api.ps1).');
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error('Configuration : API_DATABASE_URL illisible (valeur non affichée).');
  }
  if (!['postgres:', 'postgresql:'].includes(u.protocol)) {
    throw new Error('Configuration : API_DATABASE_URL doit commencer par postgresql:// (valeur non affichée).');
  }
  const compte = decodeURIComponent(u.username);
  if (!compte || COMPTES_INTERDITS.includes(compte.toLowerCase())) {
    throw new Error('Configuration : le back-end ne se connecte jamais avec le compte postgres (utiliser mawjoud_api).');
  }
  if (environnement === 'test') {
    // Les tests ne visent que mawjoud_test, quelle que soit la base écrite dans .env.
    u.pathname = '/mawjoud_test';
  }
  const base = decodeURIComponent(u.pathname.replace(/^\//, ''));
  if (!base || BASES_INTERDITES.includes(base.toLowerCase())) {
    throw new Error(`Configuration : base « ${base} » interdite.`);
  }
  if (environnement === 'test' && base !== 'mawjoud_test') {
    throw new Error('Configuration : les tests ne s\'exécutent que sur mawjoud_test.');
  }
  return u.toString();
}

export function lireConfiguration(surcharges: Partial<Configuration> = {}): Configuration {
  const brut = process.env.NODE_ENV ?? 'development';
  if (!['development', 'production', 'test'].includes(brut)) {
    throw new Error('Configuration : NODE_ENV doit valoir development, production ou test.');
  }
  const environnement = brut as Environnement;
  const production = environnement === 'production';

  const frontUrl = process.env.FRONT_URL ?? 'http://localhost:4200';
  const originesCors = (process.env.CORS_ORIGINES ?? 'http://localhost:4200')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const fournisseurEmail = (environnement === 'test'
    ? 'memoire'
    : (process.env.EMAIL_FOURNISSEUR ?? 'console')) as FournisseurEmail;

  if (!['console', 'brevo', 'memoire'].includes(fournisseurEmail)) {
    throw new Error('Configuration : EMAIL_FOURNISSEUR doit valoir console ou brevo.');
  }
  if (production) {
    if (fournisseurEmail !== 'brevo') throw new Error('Configuration : en production, les e-mails passent par Brevo.');
    if (!frontUrl.startsWith('https://')) throw new Error('Configuration : en production, FRONT_URL doit être en https.');
    if (originesCors.some((o) => !o.startsWith('https://'))) {
      throw new Error('Configuration : en production, CORS_ORIGINES ne contient que des origines https.');
    }
  }

  const config: Configuration = {
    environnement,
    hote: process.env.API_HOTE ?? (production ? '0.0.0.0' : '127.0.0.1'),
    port: entier('API_PORT', 3000),
    urlBase: verifierUrlBase(process.env.API_DATABASE_URL, environnement),
    frontUrl,
    originesCors,
    fournisseurEmail,
    trustProxy: process.env.TRUST_PROXY === 'true',
    cookies: {
      // Préfixe __Host- en production : cookie lié à l'hôte, Secure et Path=/ obligatoires.
      session: production ? '__Host-mawjoud_session' : 'mawjoud_session',
      // Nom attendu par défaut par Angular (HttpClient, protection XSRF).
      csrf: 'XSRF-TOKEN',
      securise: production,
    },
    session: { dureeGlissanteMs: 7 * JOUR, dureeMaxMs: 30 * JOUR, rafraichirApresMs: 5 * MINUTE },
    jetons: { verificationMs: 24 * HEURE, reinitialisationMs: HEURE },
    limites: {
      connexionParEmail: { max: 5, fenetreMs: 15 * MINUTE },
      connexionParIp: { max: 20, fenetreMs: 15 * MINUTE },
      envoisParIp: { max: 10, fenetreMs: HEURE },
      envoisParEmail: { max: 3, fenetreMs: HEURE },
      publicParIp: { max: 120, fenetreMs: MINUTE },
    },
  };
  return { ...config, ...surcharges };
}
