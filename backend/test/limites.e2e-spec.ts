import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { lireConfiguration, type Configuration } from '../src/config/configuration.js';
import { administrateur, compteVerifie, connecter, demarrer, emailUnique, MDP, type Contexte, type Session } from './aide.js';

/**
 * Partie 9d : limitation de débit, route par route. Chaque limite est ramenée à quelques requêtes dans une
 * application à part (mêmes routes, même base), pour la dépasser vraiment. Vérifié à chaque fois : 429,
 * corps { erreur: 'trop-de-tentatives', reessayerDans } sans rien d'autre, en-tête Retry-After, et la clé
 * de la limite (par compte, par adresse ou par IP).
 */
let ctx: Contexte;
beforeAll(async () => { ctx = await demarrer(); });
afterAll(async () => { await ctx.comptes.travauxTermines(); await ctx.app.close(); });

type Limites = Configuration['limites'];
const N = 3;
const serre = { max: N, fenetreMs: 60_000 };

/** Application dont une ou plusieurs limites sont ramenées à N requêtes. */
async function avec<R>(limites: Partial<Limites>, fn: (http: Contexte['http']) => Promise<R>): Promise<R> {
  const autre = await demarrer({ limites: { ...lireConfiguration().limites, ...limites } });
  try {
    return await fn(autre.http);
  } finally {
    await autre.comptes.travauxTermines();
    await autre.app.close();
  }
}

/** Le refus ne dit rien d'autre que la limite atteinte. */
function refusPropre(r: request.Response): void {
  expect(r.status).toBe(429);
  expect(Object.keys(r.body).sort()).toEqual(['erreur', 'reessayerDans']);
  expect(r.body.erreur).toBe('trop-de-tentatives');
  expect(Number.isInteger(r.body.reessayerDans) && r.body.reessayerDans > 0).toBe(true);
  expect(r.headers['retry-after']).toBe(String(r.body.reessayerDans));
  const brut = r.text;
  for (const fuite of ['stack', 'Error', 'prive.', 'annuaire.', 'SELECT', '\\', 'node_modules', 'mawjoud_api']) expect(brut).not.toContain(fuite);
}

const ecrire = (s: Session, r: request.Test) => r.set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf);

describe('Routes publiques (par IP)', () => {
  test(`${N} requêtes, puis 429 sur toutes les routes publiques de cette IP`, async () => {
    await avec({ publicParIp: serre }, async (http) => {
      for (let i = 0; i < N; i++) await request(http).get('/api/v1/gouvernorats').expect(200);
      refusPropre(await request(http).get('/api/v1/gouvernorats'));
      refusPropre(await request(http).get('/api/v1/pharmacies'));
      refusPropre(await request(http).get('/api/v1/medicaments').query({ q: 'para' }));
    });
  });
});

describe('Connexion (par adresse, puis par IP)', () => {
  test('échecs par adresse : cette adresse est bloquée, même avec le bon mot de passe ; une autre adresse passe', async () => {
    const [a, b] = [await compteVerifie(ctx), await compteVerifie(ctx)];
    await avec({ connexionParEmail: serre }, async (http) => {
      for (let i = 0; i < N; i++) await request(http).post('/api/comptes/connexion').send({ email: a, motDePasse: 'faux-mot-de-passe-1' }).expect(401);
      refusPropre(await request(http).post('/api/comptes/connexion').send({ email: a, motDePasse: MDP }));
      // Variante de casse : même clé.
      refusPropre(await request(http).post('/api/comptes/connexion').send({ email: a.toUpperCase(), motDePasse: MDP }));
      await request(http).post('/api/comptes/connexion').send({ email: b, motDePasse: MDP }).expect(200);
    });
  });

  test('échecs par IP, sur des adresses différentes (existantes ou non) : l\'IP est bloquée', async () => {
    const vraie = await compteVerifie(ctx);
    await avec({ connexionParIp: serre }, async (http) => {
      for (let i = 0; i < N; i++) {
        await request(http).post('/api/comptes/connexion').send({ email: emailUnique('inconnu'), motDePasse: 'faux-mot-de-passe-1' }).expect(401);
      }
      refusPropre(await request(http).post('/api/comptes/connexion').send({ email: vraie, motDePasse: MDP }));
    });
  });
});

describe('Inscription et renvoi du lien (envois d\'e-mails par IP)', () => {
  test(`${N} envois, puis 429 pour l'inscription comme pour le renvoi`, async () => {
    await avec({ envoisParIp: serre }, async (http) => {
      for (let i = 0; i < N; i++) await request(http).post('/api/comptes/patients').send({ email: emailUnique(), motDePasse: MDP }).expect(202);
      refusPropre(await request(http).post('/api/comptes/pharmaciens').send({ email: emailUnique(), motDePasse: MDP }));
      refusPropre(await request(http).post('/api/comptes/verification-email/renvoi').send({}));
    });
  });
});

describe('Mot de passe oublié et liens reçus par e-mail', () => {
  test('mot de passe oublié : par adresse (une autre adresse passe), puis par IP', async () => {
    await avec({ envoisParEmail: serre }, async (http) => {
      const a = emailUnique();
      for (let i = 0; i < N; i++) await request(http).post('/api/comptes/mot-de-passe-oublie').send({ email: a }).expect(202);
      refusPropre(await request(http).post('/api/comptes/mot-de-passe-oublie').send({ email: a }));
      await request(http).post('/api/comptes/mot-de-passe-oublie').send({ email: emailUnique() }).expect(202);
    });
    await avec({ envoisParIp: serre }, async (http) => {
      for (let i = 0; i < N; i++) await request(http).post('/api/comptes/mot-de-passe-oublie').send({ email: emailUnique() }).expect(202);
      refusPropre(await request(http).post('/api/comptes/mot-de-passe-oublie').send({ email: emailUnique() }));
    });
  });

  test('réinitialisation et vérification d\'adresse : les liens refusés comptent comme des échecs par IP', async () => {
    const faux = () => ({ jeton: 'A'.repeat(43) });
    await avec({ connexionParIp: serre }, async (http) => {
      for (let i = 0; i < N - 1; i++) {
        await request(http).post('/api/comptes/reinitialisation').send({ ...faux(), nouveauMotDePasse: 'tilleul-ambre-52' }).expect(400);
      }
      await request(http).post('/api/comptes/verification-email').send(faux()).expect(400);
      refusPropre(await request(http).post('/api/comptes/reinitialisation').send({ ...faux(), nouveauMotDePasse: 'tilleul-ambre-52' }));
      refusPropre(await request(http).post('/api/comptes/verification-email').send(faux()));
    });
  });
});

describe('Alertes du patient (par compte ; par IP sans session)', () => {
  test('le compte A est bloqué, le compte B passe ; désinscription sans session limitée par IP', async () => {
    const A = await connecter(ctx, await compteVerifie(ctx));
    const B = await connecter(ctx, await compteVerifie(ctx));
    await avec({ alertesParCompte: serre }, async (http) => {
      for (let i = 0; i < N; i++) await request(http).get('/api/v1/alertes').set('Cookie', A.cookie).expect(200);
      refusPropre(await request(http).get('/api/v1/alertes').set('Cookie', A.cookie));
      refusPropre(await ecrire(A, request(http).post('/api/v1/alertes')).send({ medicamentId: randomUUID(), gouvernorat: null, consentement: true }));
      await request(http).get('/api/v1/alertes').set('Cookie', B.cookie).expect(200);
      for (let i = 0; i < N; i++) await request(http).post('/api/v1/alertes/desabonnement').send({ jeton: 'A'.repeat(43) }).expect((r) => expect(r.status).not.toBe(429));
      refusPropre(await request(http).post('/api/v1/alertes/desabonnement').send({ jeton: 'A'.repeat(43) }));
    });
  });
});

describe('Espace pharmacien (par compte), demande de rattachement comprise', () => {
  test('le pharmacien A est bloqué sur toutes ses routes, le pharmacien B passe', async () => {
    const A = await connecter(ctx, await compteVerifie(ctx, 'pharmaciens'));
    const B = await connecter(ctx, await compteVerifie(ctx, 'pharmaciens'));
    await avec({ pharmacienParCompte: serre }, async (http) => {
      for (let i = 0; i < N; i++) await request(http).get('/api/pharmacien/rattachement').set('Cookie', A.cookie).expect(200);
      refusPropre(await request(http).get('/api/pharmacien/rattachement').set('Cookie', A.cookie));
      refusPropre(await ecrire(A, request(http).post('/api/pharmacien/rattachement')).send({ pharmacieId: randomUUID() }));
      refusPropre(await request(http).get('/api/v1/pharmacien/pharmacies').set('Cookie', A.cookie));
      await request(http).get('/api/pharmacien/rattachement').set('Cookie', B.cookie).expect(200);
    });
  });
});

describe('Administration (par compte), route par route', () => {
  const id = randomUUID();
  // Chaque ligne a toujours 4 éléments : avec 3, Jest prendrait le 4e paramètre pour un rappel done().
  const routes: [string, 'get' | 'post', string, Record<string, unknown> | null][] = (<[string, 'get' | 'post', string, Record<string, unknown>?][]>[
    ['Partie 8', 'get', '/api/v1/admin/demandes-position'],
    ['Partie 8', 'post', `/api/v1/admin/demandes-position/${id}/valider`],
    ['Partie 8', 'post', `/api/v1/admin/demandes-position/${id}/refuser`, { motif: 'essai' }],
    ['Partie 8', 'get', '/api/v1/admin/pharmacies'],
    ['Partie 8', 'post', `/api/v1/admin/pharmacies/${id}/relire`],
    ['Partie 8', 'post', `/api/v1/admin/pharmacies/${id}/statut`, { statut: 'fermee' }],
    ['Partie 9c', 'post', `/api/v1/admin/pharmacies/${id}/nom`, { nom: 'Essai' }],
    ['Partie 9c', 'post', '/api/v1/admin/pharmacies', { rattachementId: id, nom: 'Essai', ville: 'Tunis', gouvernorat: 11 }],
    ['Partie 9c', 'post', `/api/v1/admin/pharmacies/${id}/fusionner`, { fusionneeId: randomUUID(), motif: 'essai' }],
    ['Partie 9c', 'get', '/api/v1/admin/comptes'],
    ['Partie 9c', 'post', `/api/v1/admin/comptes/${id}/suspendre`, { motif: 'essai' }],
    ['Partie 9c', 'post', `/api/v1/admin/comptes/${id}/retablir`, { motif: 'essai' }],
    ['Partie 9c', 'get', '/api/v1/admin/journal'],
    ['Partie 5', 'get', '/api/admin/rattachements'],
    ['Partie 5', 'post', `/api/admin/rattachements/${id}/valider`],
    ['Partie 5', 'post', `/api/admin/rattachements/${id}/refuser`, { motifCode: 'autre', motifPrecision: 'essai' }],
  ]).map(([p, m, r, c]) => [p, m, r, c ?? null]);

  test.each(routes)('%s : %s %s', async (_partie, methode, route, corps) => {
    const admin = await connecter(ctx, await administrateur(ctx));
    const autre = await connecter(ctx, await administrateur(ctx));
    const envoyer = (http: Contexte['http'], s: Session) => methode === 'get'
      ? request(http).get(route).set('Cookie', s.cookie)
      : ecrire(s, request(http).post(route)).send(corps ?? {});
    await avec({ adminParCompte: serre }, async (http) => {
      for (let i = 0; i < N; i++) expect((await envoyer(http, admin)).status).not.toBe(429);
      refusPropre(await envoyer(http, admin));
      // Par compte : un autre administrateur n'est pas touché.
      expect((await envoyer(http, autre)).status).not.toBe(429);
    });
  });
});
