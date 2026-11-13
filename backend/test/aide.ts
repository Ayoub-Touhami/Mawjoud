import 'reflect-metadata';
import type { INestApplication, Type } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { creerApplication } from '../src/application.js';
import { AuditService } from '../src/audit/audit.service.js';
import { BaseService } from '../src/base/base.service.js';
import { creerAdministrateur } from '../src/comptes/administrateur.js';
import { ComptesService } from '../src/comptes/comptes.service.js';
import { chargerFichierEnv, lireConfiguration, type Configuration } from '../src/config/configuration.js';
import { FOURNISSEUR_EMAIL } from '../src/config/jetons-injection.js';
import type { EmailMemoire } from '../src/email/fournisseurs.js';
import { MotsDePasseService } from '../src/securite/mots-de-passe.service.js';

/** Mot de passe de test conforme (13 caractères, absent de la liste). Jamais un vrai mot de passe. */
export const MDP = 'cedre-olive-73';

export interface Contexte {
  app: INestApplication;
  http: App;
  emails: EmailMemoire;
  base: BaseService;
  comptes: ComptesService;
  config: Configuration;
}

/** Démarre l'application complète sur mawjoud_test (la configuration refuse toute autre base). */
export async function demarrer(surcharges: Partial<Configuration> = {}, controleurs: Type[] = []): Promise<Contexte> {
  process.env.NODE_ENV = 'test';
  chargerFichierEnv();
  // Toutes les requêtes des tests viennent de 127.0.0.1 : les limites par IP sont relevées ici,
  // sauf quand un test les règle lui-même. Les limites par adresse e-mail restent celles du serveur.
  const defaut = lireConfiguration();
  const config = lireConfiguration({
    ...surcharges,
    limites: {
      ...defaut.limites,
      connexionParIp: { max: 1000, fenetreMs: 60_000 },
      envoisParIp: { max: 1000, fenetreMs: 60_000 },
      publicParIp: { max: 10_000, fenetreMs: 60_000 },
      pharmacienParCompte: { max: 10_000, fenetreMs: 60_000 },
      ...surcharges.limites,
    },
  });
  const app = await creerApplication(config, controleurs);
  await app.init();
  const base = app.get(BaseService);
  const [b] = await base.requete<{ base: string }>('SELECT current_database() AS base');
  if (b.base !== 'mawjoud_test') throw new Error('Les tests ne tournent que sur mawjoud_test.');
  return { app, http: app.getHttpServer() as App, emails: app.get(FOURNISSEUR_EMAIL), base, comptes: app.get(ComptesService), config };
}

export function emailUnique(prefixe = 't'): string {
  return `${prefixe}-${Date.now()}-${randomBytes(4).toString('hex')}@exemple.tn`;
}

export function jetonDuLien(texte: string | undefined): string {
  const m = /jeton=([A-Za-z0-9_-]{43})/.exec(texte ?? '');
  if (!m) throw new Error('Aucun lien avec jeton dans l\'e-mail.');
  return m[1];
}

/** Cookies posés par une réponse : nom → { valeur, attributs }. */
export function cookies(res: request.Response): Record<string, { valeur: string; attributs: string }> {
  const brut = res.headers['set-cookie'] as unknown as string[] | undefined;
  const r: Record<string, { valeur: string; attributs: string }> = {};
  for (const c of brut ?? []) {
    const [paire, ...attributs] = c.split(';');
    const i = paire.indexOf('=');
    r[paire.slice(0, i).trim()] = { valeur: decodeURIComponent(paire.slice(i + 1)), attributs: attributs.join(';').trim() };
  }
  return r;
}

export interface Session {
  cookie: string;
  csrf: string;
  utilisateur: Record<string, unknown>;
}

export async function connecter(ctx: Contexte, email: string, motDePasse = MDP): Promise<Session> {
  const res = await request(ctx.http).post('/api/comptes/connexion').send({ email, motDePasse }).expect(200);
  const c = cookies(res);
  return {
    cookie: `${ctx.config.cookies.session}=${c[ctx.config.cookies.session].valeur}; ${ctx.config.cookies.csrf}=${c[ctx.config.cookies.csrf].valeur}`,
    csrf: c[ctx.config.cookies.csrf].valeur,
    utilisateur: res.body as Record<string, unknown>,
  };
}

/** Inscription + vérification de l'adresse par le lien reçu. */
export async function compteVerifie(ctx: Contexte, role: 'patients' | 'pharmaciens' = 'patients', email = emailUnique()): Promise<string> {
  await request(ctx.http).post(`/api/comptes/${role}`).send({ email, motDePasse: MDP }).expect(202);
  const jeton = jetonDuLien(ctx.emails.dernierPour(email)?.texte);
  await request(ctx.http).post('/api/comptes/verification-email').send({ jeton }).expect(204);
  return email;
}

/** Administrateur créé comme par le script de démarrage (sans la restriction « premier seulement »). */
export async function administrateur(ctx: Contexte): Promise<string> {
  const email = emailUnique('admin');
  const r = await creerAdministrateur(ctx.base, ctx.app.get(MotsDePasseService), ctx.app.get(AuditService), email, MDP, {
    premierSeulement: false,
  });
  if (r.resultat !== 'cree') throw new Error(`Administrateur non créé : ${r.resultat}`);
  return email;
}

/** Pharmacie de test dans l'annuaire de mawjoud_test. */
export async function pharmacie(ctx: Contexte): Promise<string> {
  const [p] = await ctx.base.requete<{ uuid: string }>(
    `INSERT INTO annuaire.pharmacie (nom, ville, gouvernorat_code, statut_publication)
     VALUES ('Pharmacie de test', 'Tunis', 11, 'en_attente_position') RETURNING uuid`,
  );
  return p.uuid;
}

/** Entrées du journal d'audit pour une cible, les plus récentes d'abord. */
export async function journal(ctx: Contexte, cibleId: string) {
  return ctx.base.requete<{ action: string; acteur_id: string | null; detail: Record<string, unknown> }>(
    `SELECT action, acteur_id, detail FROM prive.journal_audit WHERE cible_id = $1 ORDER BY id DESC`,
    [cibleId],
  );
}

export async function uuidDe(ctx: Contexte, email: string): Promise<string> {
  const [u] = await ctx.base.requete<{ uuid: string }>(`SELECT uuid FROM prive.utilisateur WHERE lower(email) = lower($1)`, [email]);
  return u.uuid;
}
