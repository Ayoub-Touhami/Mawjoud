import { Controller, Get, Post } from '@nestjs/common';
import request from 'supertest';
import { lireConfiguration, verifierUrlBase } from '../src/config/configuration.js';
import { Public } from '../src/securite/acces.js';
import { administrateur, compteVerifie, connecter, cookies, demarrer, emailUnique, journal, MDP, uuidDe, type Contexte } from './aide.js';

/** Routes de test : l'une sans déclaration d'accès (doit être refusée), l'autre publique. */
@Controller('essai')
class EssaiController {
  @Get('oubliee') oubliee() { return { fuite: true }; }
  @Post('oubliee') oublieePost() { return { fuite: true }; }
  @Get('publique') @Public() publique() { return { ok: true }; }
}

let ctx: Contexte;
beforeAll(async () => { ctx = await demarrer({}, [EssaiController]); });
afterAll(async () => { await ctx.comptes.travauxTermines(); await ctx.app.close(); });
const api = () => request(ctx.http);

describe('Limitation des tentatives de connexion', () => {
  test('5 échecs pour une adresse : la 6e tentative est bloquée (429), même avec le bon mot de passe', async () => {
    const email = await compteVerifie(ctx);
    for (let i = 0; i < 5; i++) {
      await api().post('/api/comptes/connexion').send({ email, motDePasse: `essai-rate-${i}-xx` }).expect(401);
    }
    const r = await api().post('/api/comptes/connexion').send({ email, motDePasse: MDP }).expect(429);
    expect(r.body.erreur).toBe('trop-de-tentatives');
    expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    expect((await journal(ctx, await uuidDe(ctx, email)))[0].detail).toEqual({ motif: 'limite_atteinte' });
  });

  test('même limite pour une adresse inconnue (ne révèle pas si elle existe)', async () => {
    const inconnue = emailUnique('inconnu');
    for (let i = 0; i < 5; i++) await api().post('/api/comptes/connexion').send({ email: inconnue, motDePasse: 'x-essai-123' }).expect(401);
    await api().post('/api/comptes/connexion').send({ email: inconnue, motDePasse: 'x-essai-123' }).expect(429);
  });

  test('limite par IP : 3 échecs sur 3 adresses différentes bloquent la 4e adresse', async () => {
    const autre = await demarrer({
      limites: { ...lireConfiguration().limites, envoisParIp: { max: 1000, fenetreMs: 60_000 }, connexionParIp: { max: 3, fenetreMs: 60_000 } },
    });
    try {
      const email = await compteVerifie(autre);
      for (let i = 0; i < 3; i++) {
        await request(autre.http).post('/api/comptes/connexion').send({ email: emailUnique('ip'), motDePasse: 'x-essai-123' }).expect(401);
      }
      await request(autre.http).post('/api/comptes/connexion').send({ email, motDePasse: MDP }).expect(429);
    } finally {
      await autre.app.close();
    }
  });

  test('envois d\'e-mails limités par adresse (3 par heure)', async () => {
    const email = await compteVerifie(ctx);
    for (let i = 0; i < 3; i++) await api().post('/api/comptes/mot-de-passe-oublie').send({ email }).expect(202);
    await api().post('/api/comptes/mot-de-passe-oublie').send({ email }).expect(429);
  });
});

describe('Accès par rôle (refus par défaut)', () => {
  test('route sans déclaration d\'accès : refusée, même pour un administrateur', async () => {
    await api().get('/api/essai/oubliee').expect(403);
    const admin = await connecter(ctx, await administrateur(ctx));
    const r = await api().get('/api/essai/oubliee').set('Cookie', admin.cookie).expect(403);
    expect(r.body).toEqual({ erreur: 'acces-refuse' });
    await api().post('/api/essai/oubliee').set('Cookie', admin.cookie).set('X-XSRF-TOKEN', admin.csrf).expect(403);
    await api().get('/api/essai/publique').expect(200);
  });

  test('administration : anonyme 401, patient 403, pharmacien 403, administrateur 200', async () => {
    await api().get('/api/admin/rattachements').expect(401);
    const patient = await connecter(ctx, await compteVerifie(ctx));
    expect((await api().get('/api/admin/rattachements').set('Cookie', patient.cookie).expect(403)).body).toEqual({ erreur: 'acces-refuse' });
    const pharmacien = await connecter(ctx, await compteVerifie(ctx, 'pharmaciens'));
    await api().get('/api/admin/rattachements').set('Cookie', pharmacien.cookie).expect(403);
    const admin = await connecter(ctx, await administrateur(ctx));
    await api().get('/api/admin/rattachements').set('Cookie', admin.cookie).expect(200);
  });

  test('espace pharmacien : patient 403 ; administrateur suspendu perd l\'administration', async () => {
    const patient = await connecter(ctx, await compteVerifie(ctx));
    await api().get('/api/pharmacien/rattachement').set('Cookie', patient.cookie).expect(403);
    const email = await administrateur(ctx);
    const admin = await connecter(ctx, email);
    await ctx.base.requete(`UPDATE prive.utilisateur SET suspendu = true WHERE email = $1`, [email]);
    await api().get('/api/admin/rattachements').set('Cookie', admin.cookie).expect(403);
  });
});

describe('Protection CSRF', () => {
  test('requête qui modifie, avec session : sans jeton ou avec un faux jeton → 403', async () => {
    const s = await connecter(ctx, await compteVerifie(ctx));
    expect((await api().post('/api/comptes/deconnexion').set('Cookie', s.cookie).expect(403)).body).toEqual({ erreur: 'csrf' });
    await api().post('/api/comptes/deconnexion').set('Cookie', s.cookie).set('X-XSRF-TOKEN', 'B'.repeat(43)).expect(403);
    // Le jeton d'une autre session ne vaut pas pour celle-ci.
    const autre = await connecter(ctx, await compteVerifie(ctx));
    await api().post('/api/comptes/deconnexion').set('Cookie', s.cookie).set('X-XSRF-TOKEN', autre.csrf).expect(403);
    await api().get('/api/comptes/moi').set('Cookie', s.cookie).expect(200);
  });

  test('origine étrangère refusée ; formulaire HTML (non JSON) refusé', async () => {
    const r = await api().post('/api/comptes/connexion').set('Origin', 'https://site-pirate.example')
      .send({ email: 'a@b.tn', motDePasse: 'x' }).expect(403);
    expect(r.body).toEqual({ erreur: 'origine-refusee' });
    await api().post('/api/comptes/connexion').set('Origin', 'http://localhost:4200').send({ email: emailUnique(), motDePasse: 'x' }).expect(401);
    await api().post('/api/comptes/connexion').type('form').send('email=a@b.tn&motDePasse=x').expect(415);
  });

  test('en-têtes de sécurité (helmet), dont Referrer-Policy: no-referrer', async () => {
    const r = await api().post('/api/comptes/verification-email').send({ jeton: 'C'.repeat(43) });
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['content-security-policy']).toContain("default-src 'self'");
    expect(r.headers['x-powered-by']).toBeUndefined();
  });

  test('/moi renvoie un nouveau cookie XSRF-TOKEN s\'il manque', async () => {
    const s = await connecter(ctx, await compteVerifie(ctx));
    const seulSession = s.cookie.split(';')[0];
    const res = await api().get('/api/comptes/moi').set('Cookie', seulSession).expect(200);
    const nouveau = cookies(res)['XSRF-TOKEN'].valeur;
    expect(nouveau).not.toBe(s.csrf);
    await api().post('/api/comptes/deconnexion').set('Cookie', `${seulSession}; XSRF-TOKEN=${nouveau}`).set('X-XSRF-TOKEN', nouveau).expect(204);
  });
});

describe('Sessions', () => {
  test('expiration glissante : l\'échéance avance, sans dépasser 30 jours après l\'ouverture', async () => {
    const email = await compteVerifie(ctx);
    const s = await connecter(ctx, email);
    const id = s.cookie.split(';')[0].split('=')[1];
    const lire = async () => (await ctx.base.requete<{ jours: number }>(
      `SELECT round(extract(epoch FROM expire_le - now()) / 86400)::int AS jours FROM prive.session WHERE id_hache = sha256(convert_to($1, 'UTF8'))`, [id]))[0];
    // Session ouverte il y a 25 jours, dernière activité il y a 6 jours : il lui reste 1 jour.
    await ctx.base.requete(
      `UPDATE prive.session SET created_at = now() - interval '25 days', derniere_activite_le = now() - interval '6 days',
              expire_le = now() + interval '1 day' WHERE id_hache = sha256(convert_to($1, 'UTF8'))`, [id]);
    const res = await api().get('/api/comptes/moi').set('Cookie', s.cookie).expect(200);
    expect(cookies(res).mawjoud_session).toBeDefined(); // cookie reposé avec la nouvelle échéance
    expect(await lire()).toEqual({ jours: 5 }); // plafond : 30 jours après l'ouverture
    // Au-delà de l'échéance : refusée.
    await ctx.base.requete(`UPDATE prive.session SET expire_le = now() - interval '1 second' WHERE id_hache = sha256(convert_to($1, 'UTF8'))`, [id]);
    await api().get('/api/comptes/moi').set('Cookie', s.cookie).expect(401);
  });

  test('une nouvelle connexion dans le même navigateur ferme l\'ancienne session', async () => {
    const email = await compteVerifie(ctx);
    const s1 = await connecter(ctx, email);
    await api().post('/api/comptes/connexion').set('Cookie', s1.cookie).set('X-XSRF-TOKEN', s1.csrf).send({ email, motDePasse: MDP }).expect(200);
    await api().get('/api/comptes/moi').set('Cookie', s1.cookie).expect(401);
  });
});

describe('Configuration', () => {
  test('le back-end refuse le compte postgres et les autres bases que mawjoud_test en test', () => {
    expect(() => verifierUrlBase('postgresql://postgres:x@127.0.0.1:5432/mawjoud', 'development')).toThrow(/postgres/);
    expect(() => verifierUrlBase('postgresql://mawjoud_api:x@127.0.0.1:5432/cleanapp', 'development')).toThrow(/interdite/);
    expect(verifierUrlBase('postgresql://mawjoud_api:x@127.0.0.1:5432/mawjoud', 'test')).toMatch(/\/mawjoud_test$/);
    // Le message d'erreur ne contient jamais le mot de passe.
    try { verifierUrlBase('postgresql://postgres:motdepasse-secret@h/mawjoud', 'development'); } catch (e) {
      expect((e as Error).message).not.toContain('motdepasse-secret');
    }
  });

  test('connecté avec mawjoud_api, sans superutilisateur', async () => {
    const [r] = await ctx.base.requete<{ compte: string; su: boolean }>(
      `SELECT current_user AS compte, rolsuper AS su FROM pg_roles WHERE rolname = current_user`);
    expect(r).toEqual({ compte: 'mawjoud_api', su: false });
    // Aucun droit sur le registre des migrations ni sur la structure.
    await expect(ctx.base.requete(`SELECT * FROM public.schema_migrations`)).rejects.toThrow();
    await expect(ctx.base.requete(`CREATE TABLE prive.intrus (x int)`)).rejects.toThrow();
  });
});
