import request from 'supertest';
import { AuditService } from '../src/audit/audit.service.js';
import { creerAdministrateur } from '../src/comptes/administrateur.js';
import { MotsDePasseService } from '../src/securite/mots-de-passe.service.js';
import { administrateur, compteVerifie, connecter, demarrer, emailUnique, journal, jetonDuLien, MDP, pharmacie, type Contexte } from './aide.js';

let ctx: Contexte;
beforeAll(async () => { ctx = await demarrer(); });
afterAll(async () => { await ctx.comptes.travauxTermines(); await ctx.app.close(); });
const api = () => request(ctx.http);

describe('Compte pharmacien et rattachement', () => {
  test('inscription, adresse à vérifier avant la réclamation, compte non vérifié jusqu\'à la validation', async () => {
    const email = emailUnique('pharma');
    await api().post('/api/comptes/pharmaciens').send({ email, motDePasse: MDP }).expect(202);
    const s0 = await connecter(ctx, email);
    expect(s0.utilisateur).toMatchObject({ role: 'pharmacien', emailVerifie: false, compteVerifie: false, suspendu: false });

    const pharmacieId = await pharmacie(ctx);
    const r0 = await api().post('/api/pharmacien/rattachement').set('Cookie', s0.cookie).set('X-XSRF-TOKEN', s0.csrf)
      .send({ pharmacieId }).expect(403);
    expect(r0.body).toEqual({ erreur: 'email-non-verifie' });

    await api().post('/api/comptes/verification-email').send({ jeton: jetonDuLien(ctx.emails.dernierPour(email)?.texte) }).expect(204);
    const s = await connecter(ctx, email);
    const demande = await api().post('/api/pharmacien/rattachement').set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf)
      .send({ pharmacieId, justificatif: { texte: 'Inscrit à l\'Ordre, numéro fictif 0000.' } }).expect(201);
    expect(demande.body).toMatchObject({ pharmacieId, etat: 'en-attente', justificatif: { texte: expect.any(String) } });

    const doublon = await api().post('/api/pharmacien/rattachement').set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf)
      .send({ pharmacieId }).expect(409);
    expect(doublon.body).toEqual({ erreur: 'demande-en-cours' });

    // L'administrateur valide : journalisé, le compte devient vérifié.
    const admin = await connecter(ctx, await administrateur(ctx));
    const liste = await api().get('/api/admin/rattachements').set('Cookie', admin.cookie).expect(200);
    expect(liste.body.some((d: { id: string }) => d.id === demande.body.id)).toBe(true);
    const v = await api().post(`/api/admin/rattachements/${demande.body.id}/valider`).set('Cookie', admin.cookie).set('X-XSRF-TOKEN', admin.csrf).expect(200);
    expect(v.body.etat).toBe('validee');
    const [entree] = await journal(ctx, demande.body.id);
    expect(entree).toMatchObject({ action: 'valider', detail: { pharmacie: pharmacieId } });
    expect(entree.acteur_id).not.toBeNull();

    const moi = await api().get('/api/comptes/moi').set('Cookie', s.cookie).expect(200);
    expect(moi.body).toMatchObject({ compteVerifie: true, pharmacieId });

    // Déjà décidée ; un second pharmacien sur la même pharmacie : conflit signalé.
    await api().post(`/api/admin/rattachements/${demande.body.id}/valider`).set('Cookie', admin.cookie).set('X-XSRF-TOKEN', admin.csrf).expect(409);
    const autre = await connecter(ctx, await compteVerifie(ctx, 'pharmaciens'));
    const d2 = await api().post('/api/pharmacien/rattachement').set('Cookie', autre.cookie).set('X-XSRF-TOKEN', autre.csrf)
      .send({ pharmacieId }).expect(201);
    expect(d2.body.conflit).toBe(true);
    const ko = await api().post(`/api/admin/rattachements/${d2.body.id}/valider`).set('Cookie', admin.cookie).set('X-XSRF-TOKEN', admin.csrf).expect(409);
    expect(ko.body).toEqual({ erreur: 'pharmacie-attribuee' });
    const refus = await api().post(`/api/admin/rattachements/${d2.body.id}/refuser`).set('Cookie', admin.cookie).set('X-XSRF-TOKEN', admin.csrf)
      .send({ motifCode: 'pharmacie-attribuee' }).expect(200);
    expect(refus.body).toMatchObject({ etat: 'refusee', motifCode: 'pharmacie-attribuee' });
    expect((await journal(ctx, d2.body.id))[0].action).toBe('refuser');
  });

  test('demande d\'ajout d\'une pharmacie absente ; pharmacie inconnue → 404', async () => {
    const s = await connecter(ctx, await compteVerifie(ctx, 'pharmaciens'));
    await api().post('/api/pharmacien/rattachement').set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf)
      .send({ pharmacieId: '00000000-0000-4000-8000-000000000000' }).expect(404);
    const d = await api().post('/api/pharmacien/rattachement').set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf)
      .send({ ajout: { nom: 'Pharmacie Nouvelle', adresse: '1 rue de test', ville: 'Sfax', telephone: '+21674000000' } }).expect(201);
    expect(d.body).toMatchObject({ pharmacieId: null, etat: 'en-attente', ajout: { ville: 'Sfax' } });
    const mienne = await api().get('/api/pharmacien/rattachement').set('Cookie', s.cookie).expect(200);
    expect(mienne.body.id).toBe(d.body.id);
    await api().post('/api/pharmacien/rattachement').set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf)
      .send({ pharmacieId: await pharmacie(ctx), ajout: { nom: 'X', adresse: '', ville: 'Y', telephone: '+21674000000' } }).expect(400);
  });
});

describe('Premier administrateur (script de démarrage)', () => {
  test('crée un administrateur vérifié ; refuse s\'il en existe déjà un ; ne promeut jamais un compte', async () => {
    const mdp = ctx.app.get(MotsDePasseService);
    const audit = ctx.app.get(AuditService);
    await administrateur(ctx); // au moins un administrateur existe
    const r1 = await creerAdministrateur(ctx.base, mdp, audit, emailUnique('admin'), MDP, { premierSeulement: true });
    expect(r1).toEqual({ resultat: 'administrateur-existe' });
    const patient = await compteVerifie(ctx);
    expect(await creerAdministrateur(ctx.base, mdp, audit, patient, MDP, { premierSeulement: false })).toEqual({ resultat: 'email-pris' });
    expect(await creerAdministrateur(ctx.base, mdp, audit, emailUnique('admin'), 'court', { premierSeulement: false }))
      .toEqual({ resultat: 'mot-de-passe-faible', motif: 'trop-court' });
    const email = emailUnique('admin');
    const r = await creerAdministrateur(ctx.base, mdp, audit, email, MDP, { premierSeulement: false });
    expect(r.resultat).toBe('cree');
    const [u] = await ctx.base.requete<{ role: string; verifie: boolean }>(
      `SELECT role, email_verifie_le IS NOT NULL AS verifie FROM prive.utilisateur WHERE email = $1`, [email]);
    expect(u).toEqual({ role: 'administrateur', verifie: true });
    if (r.resultat === 'cree') expect((await journal(ctx, r.uuid))[0]).toMatchObject({ action: 'creer_administrateur', detail: { origine: 'script' } });
  });
});
