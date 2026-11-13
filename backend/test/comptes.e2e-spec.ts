import request from 'supertest';
import { compteVerifie, connecter, cookies, demarrer, emailUnique, journal, jetonDuLien, MDP, uuidDe, type Contexte } from './aide.js';

let ctx: Contexte;
beforeAll(async () => { ctx = await demarrer(); });
afterAll(async () => { await ctx.comptes.travauxTermines(); await ctx.app.close(); });

const api = () => request(ctx.http);

describe('Inscription', () => {
  test('un patient s\'inscrit : 202, e-mail de vérification, empreinte argon2id, adresse non vérifiée', async () => {
    const email = emailUnique();
    const res = await api().post('/api/comptes/patients').send({ email, motDePasse: MDP, langue: 'fr' }).expect(202);
    expect(res.body).toEqual({ statut: 'envoye' });
    expect(JSON.stringify(res.body)).not.toContain(MDP);

    const [u] = await ctx.base.requete<{ role: string; mot_de_passe_hache: string; email_verifie_le: Date | null }>(
      `SELECT role, mot_de_passe_hache, email_verifie_le FROM prive.utilisateur WHERE email = $1`, [email]);
    expect(u.role).toBe('patient');
    expect(u.mot_de_passe_hache).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(u.mot_de_passe_hache).not.toContain(MDP);
    expect(u.email_verifie_le).toBeNull();

    const mail = ctx.emails.dernierPour(email);
    expect(mail?.texte).toContain('/compte/verification-email?jeton=');
    // La base garde l'empreinte SHA-256 du jeton (32 octets), jamais le jeton.
    const jeton = jetonDuLien(mail?.texte);
    const [j] = await ctx.base.requete<{ n: number; heures: number }>(
      `SELECT count(*)::int AS n, max(extract(epoch FROM expire_le - created_at) / 3600)::int AS heures
         FROM prive.jeton WHERE jeton_hache = sha256(convert_to($1, 'UTF8')) AND type = 'verification_email'`, [jeton]);
    expect(j).toEqual({ n: 1, heures: 24 });
    const [trace] = await ctx.base.requete<{ type: string; statut: string }>(
      `SELECT e.type, e.statut FROM prive.envoi_email e JOIN prive.utilisateur u ON u.id = e.utilisateur_id WHERE u.email = $1`, [email]);
    expect(trace).toEqual({ type: 'verification_email', statut: 'envoye' });
  });

  test('adresse déjà inscrite : même réponse, et son propriétaire reçoit « vous avez déjà un compte »', async () => {
    const email = emailUnique();
    const r1 = await api().post('/api/comptes/patients').send({ email, motDePasse: MDP }).expect(202);
    const r2 = await api().post('/api/comptes/patients').send({ email: email.toUpperCase(), motDePasse: 'autre-phrase-de-passe' }).expect(202);
    expect(r2.body).toEqual(r1.body);
    expect(ctx.emails.dernierPour(email)?.sujet).toContain('déjà un compte');
    const [n] = await ctx.base.requete<{ n: number }>(`SELECT count(*)::int AS n FROM prive.utilisateur WHERE lower(email) = $1`, [email]);
    expect(n.n).toBe(1);
  });

  test.each([
    ['123456789', 'trop-court'],
    ['1234567890', 'trop-courant'],
    ['x'.repeat(129), 'trop-long'],
    // Liste française et arabe translittérée : la racine, seule ou suivie de chiffres et de ponctuation.
    ['motdepasse', 'trop-courant'],
    ['MotDePasse2026!', 'trop-courant'],
    ['azertyuiop', 'trop-courant'],
    ['bismillah123', 'trop-courant'],
    ['tunisie 2026', 'trop-courant'],
    ['mohamed1234', 'trop-courant'],
    ['clubafricain', 'trop-courant'],
  ])('mot de passe « %s » refusé (%s)', async (motDePasse, motif) => {
    const res = await api().post('/api/comptes/patients').send({ email: emailUnique(), motDePasse }).expect(400);
    expect(res.body).toEqual({ erreur: 'mot-de-passe-faible', motif });
  });

  test('mot de passe égal à l\'adresse refusé', async () => {
    const email = emailUnique();
    const res = await api().post('/api/comptes/patients').send({ email, motDePasse: email }).expect(400);
    expect(res.body.motif).toBe('identique-email');
  });

  test('une racine de la liste suivie d\'autres mots reste acceptée (la règle ne retire que chiffres et ponctuation)', async () => {
    await api().post('/api/comptes/patients').send({ email: emailUnique(), motDePasse: 'motdepasse-de-cedre' }).expect(202);
  });

  test('phrase de passe en arabe acceptée (10 caractères comptés en lettres)', async () => {
    await api().post('/api/comptes/patients').send({ email: emailUnique(), motDePasse: 'صيدلية موجود' }).expect(202);
  });

  test('entrées strictes : champ inconnu, adresse invalide, rôle imposé refusés sans recopier les valeurs', async () => {
    const r1 = await api().post('/api/comptes/patients').send({ email: emailUnique(), motDePasse: MDP, role: 'administrateur' }).expect(400);
    expect(r1.body).toEqual({ erreur: 'donnees-invalides', champs: ['role'] });
    const r2 = await api().post('/api/comptes/patients').send({ email: 'pas-une-adresse', motDePasse: MDP }).expect(400);
    expect(r2.body.champs).toEqual(['email']);
    expect(JSON.stringify(r2.body)).not.toContain(MDP);
  });
});

describe('Vérification de l\'adresse', () => {
  test('le lien vérifie l\'adresse, une seule fois', async () => {
    const email = emailUnique();
    await api().post('/api/comptes/patients').send({ email, motDePasse: MDP }).expect(202);
    const jeton = jetonDuLien(ctx.emails.dernierPour(email)?.texte);
    await api().post('/api/comptes/verification-email').send({ jeton }).expect(204);
    const [u] = await ctx.base.requete<{ v: boolean }>(`SELECT email_verifie_le IS NOT NULL AS v FROM prive.utilisateur WHERE email = $1`, [email]);
    expect(u.v).toBe(true);
    const r = await api().post('/api/comptes/verification-email').send({ jeton }).expect(400);
    expect(r.body).toEqual({ erreur: 'lien-invalide' });
  });

  test('lien expiré : 410, puis renvoi d\'un nouveau lien à partir de l\'ancien', async () => {
    const email = emailUnique();
    await api().post('/api/comptes/patients').send({ email, motDePasse: MDP }).expect(202);
    const ancien = jetonDuLien(ctx.emails.dernierPour(email)?.texte);
    await ctx.base.requete(
      `UPDATE prive.jeton SET expire_le = now() - interval '1 minute', created_at = now() - interval '2 days'
        WHERE utilisateur_id = (SELECT id FROM prive.utilisateur WHERE email = $1)`, [email]);
    const r = await api().post('/api/comptes/verification-email').send({ jeton: ancien }).expect(410);
    expect(r.body).toEqual({ erreur: 'lien-expire' });

    await api().post('/api/comptes/verification-email/renvoi').send({ jetonExpire: ancien }).expect(202);
    const nouveau = jetonDuLien(ctx.emails.dernierPour(email)?.texte);
    expect(nouveau).not.toBe(ancien);
    await api().post('/api/comptes/verification-email').send({ jeton: nouveau }).expect(204);
  });

  test('jeton inconnu ou mal formé', async () => {
    await api().post('/api/comptes/verification-email').send({ jeton: 'A'.repeat(43) }).expect(400);
    const r = await api().post('/api/comptes/verification-email').send({ jeton: 'court' }).expect(400);
    expect(r.body.erreur).toBe('donnees-invalides');
  });
});

describe('Connexion', () => {
  test('connexion réussie : cookie HttpOnly SameSite=Strict, cookie XSRF-TOKEN, /moi, journal', async () => {
    const email = await compteVerifie(ctx);
    const res = await api().post('/api/comptes/connexion').send({ email, motDePasse: MDP }).expect(200);
    expect(res.body).toMatchObject({ email, role: 'patient', emailVerifie: true });
    expect(Object.keys(res.body).sort()).toEqual(['email', 'emailVerifie', 'id', 'role']);
    const c = cookies(res);
    expect(c.mawjoud_session.valeur).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(c.mawjoud_session.attributs).toMatch(/HttpOnly/);
    expect(c.mawjoud_session.attributs).toMatch(/SameSite=Strict/);
    expect(c.mawjoud_session.attributs).toMatch(/Expires=/);
    expect(c['XSRF-TOKEN'].attributs).not.toMatch(/HttpOnly/);
    // En base : l'empreinte de l'identifiant, jamais l'identifiant.
    const [s] = await ctx.base.requete<{ n: number; jours: number }>(
      `SELECT count(*)::int AS n, max(extract(epoch FROM expire_le - created_at) / 86400)::int AS jours
         FROM prive.session WHERE id_hache = sha256(convert_to($1, 'UTF8'))`, [c.mawjoud_session.valeur]);
    expect(s).toEqual({ n: 1, jours: 7 });

    const cookie = `mawjoud_session=${c.mawjoud_session.valeur}`;
    const moi = await api().get('/api/comptes/moi').set('Cookie', cookie).expect(200);
    expect(moi.body.email).toBe(email);
    const uuid = await uuidDe(ctx, email);
    expect((await journal(ctx, uuid))[0].action).toBe('connexion_reussie');
  });

  test('mauvais mot de passe et adresse inconnue : même réponse 401, journalisées sans mot de passe', async () => {
    const email = await compteVerifie(ctx);
    const faux = 'mauvais-mot-de-passe-42';
    const r1 = await api().post('/api/comptes/connexion').send({ email, motDePasse: faux }).expect(401);
    const r2 = await api().post('/api/comptes/connexion').send({ email: emailUnique('inconnu'), motDePasse: faux }).expect(401);
    expect(r1.body).toEqual({ erreur: 'identifiants' });
    expect(r2.body).toEqual(r1.body);
    expect(r1.headers['set-cookie']).toBeUndefined();

    const [entree] = await journal(ctx, await uuidDe(ctx, email));
    expect(entree).toMatchObject({ action: 'connexion_echouee', acteur_id: null, detail: { motif: 'mot_de_passe' } });
    const [tout] = await ctx.base.requete<{ texte: string }>(`SELECT string_agg(detail::text || cible_id, ' ') AS texte FROM prive.journal_audit`);
    expect(tout.texte).not.toContain(faux);
    expect(tout.texte).not.toContain(MDP);
  });

  test('l\'adresse est reconnue sans tenir compte de la casse', async () => {
    const email = await compteVerifie(ctx);
    await api().post('/api/comptes/connexion').send({ email: `  ${email.toUpperCase()} `, motDePasse: MDP }).expect(200);
  });
});

describe('Déconnexion', () => {
  test('ferme la session en base et efface les cookies ; l\'ancien cookie ne sert plus', async () => {
    const s = await connecter(ctx, await compteVerifie(ctx));
    const res = await api().post('/api/comptes/deconnexion').set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf).expect(204);
    expect(cookies(res).mawjoud_session.valeur).toBe('');
    await api().get('/api/comptes/moi').set('Cookie', s.cookie).expect(401);
  });
});

describe('Réinitialisation du mot de passe', () => {
  test('lien unique, nouveau mot de passe, toutes les sessions fermées, journal', async () => {
    const email = await compteVerifie(ctx);
    const s1 = await connecter(ctx, email);
    const s2 = await connecter(ctx, email);

    const r = await api().post('/api/comptes/mot-de-passe-oublie').send({ email }).expect(202);
    await ctx.comptes.travauxTermines();
    const jeton = jetonDuLien(ctx.emails.dernierPour(email)?.texte);
    expect(ctx.emails.dernierPour(email)?.texte).toContain('/compte/mot-de-passe-oublie?jeton=');

    const nouveau = 'figuier-jasmin-2026';
    await api().post('/api/comptes/reinitialisation').send({ jeton, nouveauMotDePasse: nouveau }).expect(204);
    await api().get('/api/comptes/moi').set('Cookie', s1.cookie).expect(401);
    await api().get('/api/comptes/moi').set('Cookie', s2.cookie).expect(401);
    await api().post('/api/comptes/connexion').send({ email, motDePasse: MDP }).expect(401);
    await api().post('/api/comptes/connexion').send({ email, motDePasse: nouveau }).expect(200);
    const rejeu = await api().post('/api/comptes/reinitialisation').send({ jeton, nouveauMotDePasse: 'autre-figuier-2026' }).expect(400);
    expect(rejeu.body).toEqual({ erreur: 'lien-invalide' });
    const actions = (await journal(ctx, await uuidDe(ctx, email))).map((e) => e.action);
    expect(actions).toContain('reinitialiser_mot_de_passe');

    // Adresse inconnue : même réponse, aucun e-mail.
    const inconnue = emailUnique('inconnu');
    const r2 = await api().post('/api/comptes/mot-de-passe-oublie').send({ email: inconnue }).expect(202);
    await ctx.comptes.travauxTermines();
    expect(r2.body).toEqual(r.body);
    expect(ctx.emails.dernierPour(inconnue)).toBeUndefined();
  });

  test('lien expiré : 410 ; un nouveau lien annule le précédent', async () => {
    const email = await compteVerifie(ctx);
    await api().post('/api/comptes/mot-de-passe-oublie').send({ email }).expect(202);
    await ctx.comptes.travauxTermines();
    const premier = jetonDuLien(ctx.emails.dernierPour(email)?.texte);
    await api().post('/api/comptes/mot-de-passe-oublie').send({ email }).expect(202);
    await ctx.comptes.travauxTermines();
    const second = jetonDuLien(ctx.emails.dernierPour(email)?.texte);
    await api().post('/api/comptes/reinitialisation').send({ jeton: premier, nouveauMotDePasse: 'premier-lien-2026' }).expect(410);
    await ctx.base.requete(
      `UPDATE prive.jeton SET expire_le = now() - interval '1 second'
        WHERE type = 'reinitialisation_mot_de_passe' AND utilisateur_id = (SELECT id FROM prive.utilisateur WHERE email = $1)`, [email]);
    const r = await api().post('/api/comptes/reinitialisation').send({ jeton: second, nouveauMotDePasse: 'second-lien-2026' }).expect(410);
    expect(r.body).toEqual({ erreur: 'lien-expire' });
  });
});

describe('Changement du mot de passe', () => {
  test('exige l\'ancien, ferme toutes les sessions, journalisé', async () => {
    const email = await compteVerifie(ctx);
    const s = await connecter(ctx, email);
    const autre = await connecter(ctx, email);
    const faux = await api().post('/api/comptes/mot-de-passe').set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf)
      .send({ motDePasseActuel: 'pas-le-bon-mdp', nouveauMotDePasse: 'nouvelle-phrase-99' }).expect(400);
    expect(faux.body).toEqual({ erreur: 'mot-de-passe-actuel' });
    await api().post('/api/comptes/mot-de-passe').set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf)
      .send({ motDePasseActuel: MDP, nouveauMotDePasse: 'nouvelle-phrase-99' }).expect(204);
    await api().get('/api/comptes/moi').set('Cookie', s.cookie).expect(401);
    await api().get('/api/comptes/moi').set('Cookie', autre.cookie).expect(401);
    expect((await journal(ctx, await uuidDe(ctx, email)))[0].action).toBe('changer_mot_de_passe');
  });
});
