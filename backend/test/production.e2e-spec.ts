import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { creerApplication } from '../src/application.js';
import { lireConfiguration, type Configuration } from '../src/config/configuration.js';
import { compteVerifie, cookies, demarrer, MDP, type Contexte } from './aide.js';

/**
 * Partie 9d : en-têtes, CORS, cookies, Swagger, et refus de démarrer en production avec une configuration
 * dangereuse. La configuration de production est lue par lireConfiguration (NODE_ENV=production) avec des
 * valeurs fictives ; les applications démarrées ici visent toujours mawjoud_test.
 */
let ctx: Contexte;
beforeAll(async () => { ctx = await demarrer(); });
afterAll(async () => { await ctx.comptes.travauxTermines(); await ctx.app.close(); });

const FRONT = 'https://mawjoud.tn';
/** Mot de passe fictif de la forme de celui du script (43 caractères), jamais un vrai. */
const MDP_FICTIF = randomBytes(32).toString('base64url');

/** Lit la configuration avec un environnement de production fictif, puis rend l'environnement d'avant. */
function configProduction(modif: Record<string, string | undefined> = {}): Configuration {
  const avant = { ...process.env };
  try {
    delete process.env.DATABASE_URL;
    Object.assign(process.env, {
      NODE_ENV: 'production', EMAIL_FOURNISSEUR: 'brevo', FRONT_URL: FRONT, CORS_ORIGINES: FRONT,
      API_DATABASE_URL: `postgresql://mawjoud_api:${MDP_FICTIF}@127.0.0.1:5432/mawjoud`,
    });
    for (const [cle, valeur] of Object.entries(modif)) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
    return lireConfiguration();
  } finally {
    for (const cle of Object.keys(process.env)) if (!(cle in avant)) delete process.env[cle];
    Object.assign(process.env, avant);
  }
}

describe('En-têtes de sécurité (helmet)', () => {
  test('présents sur les réponses, sans X-Powered-By', async () => {
    const r = await request(ctx.http).get('/api/v1/gouvernorats').expect(200);
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(r.headers['strict-transport-security']).toMatch(/max-age=\d+/);
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['content-security-policy']).toContain("frame-ancestors 'self'");
    expect(r.headers['cross-origin-opener-policy']).toBe('same-origin');
    expect(r.headers['x-powered-by']).toBeUndefined();
    // Aussi sur une erreur.
    const e = await request(ctx.http).get('/api/inexistante').expect(404);
    expect(e.headers['referrer-policy']).toBe('no-referrer');
    expect(e.headers['x-powered-by']).toBeUndefined();
  });
});

describe('CORS', () => {
  test('développement : seule l\'origine du front-end est admise, jamais « * »', async () => {
    const ok = await request(ctx.http).get('/api/v1/gouvernorats').set('Origin', 'http://localhost:4200').expect(200);
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:4200');
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    const non = await request(ctx.http).get('/api/v1/gouvernorats').set('Origin', 'https://site-pirate.example');
    expect(non.headers['access-control-allow-origin']).toBeUndefined();
    const pre = await request(ctx.http).options('/api/comptes/connexion')
      .set('Origin', 'https://site-pirate.example').set('Access-Control-Request-Method', 'POST');
    expect(pre.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('production : liste explicite lue dans CORS_ORIGINES, pas d\'autre origine, jamais « * »', async () => {
    const prod = configProduction({ CORS_ORIGINES: `${FRONT}, https://www.mawjoud.tn` });
    expect(prod.originesCors).toEqual([FRONT, 'https://www.mawjoud.tn']);
    const app = await demarrer({ originesCors: prod.originesCors });
    try {
      for (const o of prod.originesCors) {
        const r = await request(app.http).get('/api/v1/gouvernorats').set('Origin', o).expect(200);
        expect(r.headers['access-control-allow-origin']).toBe(o);
        expect(r.headers['access-control-allow-credentials']).toBe('true');
      }
      for (const o of ['http://localhost:4200', 'http://mawjoud.tn', 'https://mawjoud.tn.pirate.example', 'null']) {
        const r = await request(app.http).get('/api/v1/gouvernorats').set('Origin', o);
        expect(r.headers['access-control-allow-origin']).toBeUndefined();
      }
    } finally {
      await app.app.close();
    }
  });
});

describe('Cookies de production', () => {
  test('session : __Host-, HttpOnly, Secure, SameSite=Strict, Path=/, sans Domain ; XSRF-TOKEN lisible mais Secure et Strict', async () => {
    const prod = configProduction();
    expect(prod.cookies).toEqual({ session: '__Host-mawjoud_session', csrf: 'XSRF-TOKEN', securise: true });
    const app = await demarrer({ cookies: prod.cookies });
    try {
      const email = await compteVerifie(ctx);
      const r = await request(app.http).post('/api/comptes/connexion').send({ email, motDePasse: MDP }).expect(200);
      const c = cookies(r);
      const session = c['__Host-mawjoud_session'].attributs;
      for (const a of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/']) expect(session).toContain(a);
      expect(session).not.toMatch(/Domain=/i);
      const csrf = c['XSRF-TOKEN'].attributs;
      for (const a of ['Secure', 'SameSite=Strict', 'Path=/']) expect(csrf).toContain(a);
      expect(csrf).not.toContain('HttpOnly');
      // La valeur du cookie de session n'apparaît pas dans le corps.
      expect(r.text).not.toContain(c['__Host-mawjoud_session'].valeur);
    } finally {
      await app.app.close();
    }
  });
});

describe('Swagger', () => {
  test('monté en développement seulement', async () => {
    await request(ctx.http).get('/api/docs').expect(404);
    const dev = await demarrer({ environnement: 'development' });
    try {
      await request(dev.http).get('/api/docs/').expect(200);
    } finally {
      await dev.app.close();
    }
  });
});

describe('Démarrage en production : configurations dangereuses refusées', () => {
  test('témoin : une configuration de production correcte est acceptée', () => {
    const c = configProduction();
    expect(c).toMatchObject({ environnement: 'production', fournisseurEmail: 'brevo', originesCors: [FRONT] });
  });

  const refus: [string, Record<string, string | undefined>, RegExp][] = [
    ['DATABASE_URL (compte postgres) dans l\'environnement', { DATABASE_URL: 'postgresql://postgres:fictif@127.0.0.1/mawjoud' }, /DATABASE_URL/],
    ['CORS « * »', { CORS_ORIGINES: '*' }, /CORS_ORIGINES/],
    ['CORS avec « * » dans la liste', { CORS_ORIGINES: `${FRONT},*` }, /CORS_ORIGINES/],
    ['CORS vide', { CORS_ORIGINES: ' , ' }, /CORS_ORIGINES/],
    ['CORS en http', { CORS_ORIGINES: 'http://mawjoud.tn' }, /CORS_ORIGINES/],
    ['mot de passe de l\'exemple', { API_DATABASE_URL: 'postgresql://mawjoud_api:changer-ceci-svp@127.0.0.1:5432/mawjoud' }, /mot de passe de mawjoud_api/],
    ['mot de passe long mais d\'exemple', { API_DATABASE_URL: 'postgresql://mawjoud_api:mot-de-passe-a-changer-absolument@127.0.0.1/mawjoud' }, /mot de passe de mawjoud_api/],
    ['mot de passe trop court', { API_DATABASE_URL: 'postgresql://mawjoud_api:Xy7-kq2Lp@127.0.0.1/mawjoud' }, /mot de passe de mawjoud_api/],
    ['compte postgres', { API_DATABASE_URL: `postgresql://postgres:${MDP_FICTIF}@127.0.0.1/mawjoud` }, /compte postgres/],
    ['e-mails dans la console', { EMAIL_FOURNISSEUR: 'console' }, /Brevo/],
    ['front-end en http', { FRONT_URL: 'http://mawjoud.tn' }, /FRONT_URL/],
  ];
  test.each(refus)('%s', (_titre, modif, motif) => {
    let message = '';
    try {
      configProduction(modif);
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(motif);
    // Le message ne recopie jamais un mot de passe.
    for (const valeur of Object.values(modif)) {
      const mdp = valeur?.match(/:\/\/[^:]+:([^@]+)@/)?.[1];
      if (mdp) expect(message).not.toContain(mdp);
    }
    expect(message).not.toContain(MDP_FICTIF);
  });

  test('rôle mawjoud_test_fixtures présent sur le serveur PostgreSQL : démarrage refusé', async () => {
    const config: Configuration = { ...ctx.config, environnement: 'production' };
    const app = await creerApplication(config);
    await expect(app.init()).rejects.toThrow(/mawjoud_test_fixtures/);
    await app.close().catch(() => undefined);
  });

  test('Swagger ne peut pas être actif en production : il n\'est monté que pour NODE_ENV=development', () => {
    expect(configProduction().environnement).toBe('production');
    // NODE_ENV inconnu (par exemple « prod ») : refusé, pour ne jamais retomber sur le développement par erreur.
    expect(() => configProduction({ NODE_ENV: 'prod' })).toThrow(/NODE_ENV/);
  });
});
