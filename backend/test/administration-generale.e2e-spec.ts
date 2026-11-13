import request from 'supertest';
import { AdministrationGeneraleService } from '../src/administration/administration-generale.service.js';
import { AuditService } from '../src/audit/audit.service.js';
import type { CompteConnecte } from '../src/securite/sessions.service.js';
import {
  administrateur, commeActeur, compteVerifie, connecter, demarrer, fixtures, idCompteParEmail, journal, uuidDe,
  type Contexte, type Session,
} from './aide.js';

/**
 * Partie 9c, sur mawjoud_test : correction du nom, création d'une fiche, fusion, suspension, lecture.
 * Chaque règle est vérifiée par l'API et, quand la base la porte, en SQL direct avec le compte de l'API.
 */
let ctx: Contexte;
const api = () => request(ctx.http);
const ADMIN = '/api/v1/admin';
const PH = '/api/v1/pharmacien';
const REFUS = { code: '42501' };
const CONTRAINTE = { code: '23514' };

let admin: Session; let idAdmin: string; let emailAdmin: string;
const P: Record<string, string> = {};   // uuid des fiches
const ID: Record<string, string> = {};  // id interne des fiches
const S: Record<string, Session> = {};  // sessions des pharmaciens
const U: Record<string, string> = {};   // id interne des pharmaciens
const E: Record<string, string> = {};   // e-mail des pharmaciens
let M: string[] = [];                   // uuid des médicaments
let MI: string[] = [];                  // id interne des médicaments

const ecrire = (s: Session, r: request.Test) => r.set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf);

async function creer(cle: string, v: { nom: string; statut: string; lat?: number; nomAVerifier?: boolean; ville?: string }) {
  const [p] = await fixtures(ctx, (tx) => tx.requete<{ uuid: string; id: string }>(
    `INSERT INTO annuaire.pharmacie (nom, ville, gouvernorat_code, latitude, longitude, position_confirmee, source_gps,
                                     precision_gps, statut_publication, nom_a_verifier, telephone_principal)
     VALUES ($1, $2, 11, $3, $4, $5, $6, $7, $8, $9, '+21671000000') RETURNING uuid, id`,
    [v.nom, v.ville ?? 'Tunis', v.lat ?? null, v.lat === undefined ? null : 10.1, v.lat !== undefined,
     v.lat !== undefined ? 'tunidoc' : null, v.lat !== undefined ? 'exact' : 'inconnu', v.statut, v.nomAVerifier ?? false]));
  P[cle] = p.uuid; ID[cle] = p.id;
}

async function pharmacien(cle: string, demande: Record<string, unknown>): Promise<string> {
  const email = await compteVerifie(ctx, 'pharmaciens');
  E[cle] = email;
  S[cle] = await connecter(ctx, email);
  U[cle] = await idCompteParEmail(ctx, email);
  const d = await ecrire(S[cle], api().post('/api/pharmacien/rattachement')).send(demande).expect(201);
  return d.body.id as string;
}

async function rattacher(cle: string, fiche: string) {
  const id = await pharmacien(cle, { pharmacieId: P[fiche] });
  await ecrire(admin, api().post(`/api/admin/rattachements/${id}/valider`)).expect(200);
  S[cle] = await connecter(ctx, E[cle]);
}

const fiche = async (cle: string) => (await ctx.base.requete<{ nom: string; statut: string; nom_a_verifier: boolean;
  fusionnee_dans: string | null; latitude: number | null }>(
  `SELECT nom, statut_publication AS statut, nom_a_verifier, fusionnee_dans, latitude FROM annuaire.pharmacie WHERE id = $1`, [ID[cle]]))[0];

const stock = async (cle: string) => Object.fromEntries((await ctx.base.requete<{ m: string; statut: string | null; par: string | null }>(
  `SELECT medicament_id AS m, statut, declare_par AS par FROM annuaire.stock WHERE pharmacie_id = $1`, [ID[cle]]))
  .map((l) => [MI.indexOf(l.m), { statut: l.statut, par: l.par }]));

const declarer = (cle: string, fiche: string, m: number, statut: string) =>
  ecrire(S[cle], api().put(`${PH}/pharmacies/${P[fiche]}/disponibilites/${M[m]}`)).send({ statut }).expect(200);

beforeAll(async () => {
  ctx = await demarrer();
  emailAdmin = await administrateur(ctx);
  admin = await connecter(ctx, emailAdmin);
  idAdmin = await idCompteParEmail(ctx, emailAdmin);
  const meds = await ctx.base.requete<{ uuid: string; id: string }>(
    `INSERT INTO annuaire.medicament (code_source, nom_commercial, dci, donnee_test)
     SELECT 'AG' || i, 'Fusionol ' || i || ' mg', 'dci fusion ' || i, true FROM generate_series(1, 4) i ORDER BY i RETURNING uuid, id`);
  M = meds.map((m) => m.uuid); MI = meds.map((m) => m.id);
});
afterAll(async () => {
  // Base partagée : les fiches publiées ici repassent à « pret_a_publier » pour les autres fichiers de tests.
  await commeActeur(ctx, idAdmin, (tx) => tx.requete(
    `UPDATE annuaire.pharmacie SET statut_publication = 'pret_a_publier' WHERE id = ANY($1::bigint[]) AND statut_publication = 'publiee'`,
    [Object.values(ID)]));
  await ctx.comptes.travauxTermines();
  await ctx.app.close();
});

// ============================================================ 1. correction du nom
describe('1. Correction du nom d\'une fiche', () => {
  beforeAll(async () => {
    await creer('N1', { nom: 'Pharmacie Nom Ancien', statut: 'en_attente_position' });
    await creer('N2', { nom: 'Pharmacie Publiée Ancienne', statut: 'publiee', lat: 36.70 });
  });

  test('fiche non publiée : ancien et nouveau nom au journal, nom « à relire » par défaut', async () => {
    const r = await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.N1}/nom`)).send({ nom: 'Pharmacie Nom Corrigé' }).expect(200);
    expect(r.body).toMatchObject({ id: P.N1, nom: 'Pharmacie Nom Corrigé', nomARelire: true, statutPublication: 'en-attente-position' });
    expect(await fiche('N1')).toMatchObject({ nom: 'Pharmacie Nom Corrigé', nom_a_verifier: true });
    const [j] = await journal(ctx, P.N1);
    expect(j).toMatchObject({ action: 'corriger', acteur_id: idAdmin,
      detail: { champ: 'nom', ancien: 'Pharmacie Nom Ancien', nouveau: 'Pharmacie Nom Corrigé', nomRelu: false } });
  });

  test('confirmation explicite (nomRelu: true) : nom relu', async () => {
    await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.N1}/nom`)).send({ nom: 'Pharmacie Nom Relu', nomRelu: true }).expect(200);
    expect(await fiche('N1')).toMatchObject({ nom: 'Pharmacie Nom Relu', nom_a_verifier: false });
  });

  test('fiche publiée : confirmation obligatoire ; avec elle, la fiche reste publiée', async () => {
    const r = await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.N2}/nom`)).send({ nom: 'Pharmacie Publiée Nouvelle' }).expect(409);
    expect(r.body).toMatchObject({ erreur: 'confirmation-requise', statut: 'publiee', champ: 'nomRelu' });
    expect(await fiche('N2')).toMatchObject({ nom: 'Pharmacie Publiée Ancienne', statut: 'publiee' });
    await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.N2}/nom`)).send({ nom: 'Pharmacie Publiée Nouvelle', nomRelu: true }).expect(200);
    expect(await fiche('N2')).toMatchObject({ nom: 'Pharmacie Publiée Nouvelle', statut: 'publiee', nom_a_verifier: false });
    expect((await api().get(`/api/v1/pharmacies/${P.N2}`).expect(200)).body.nom).toBe('Pharmacie Publiée Nouvelle');
    const [j] = await journal(ctx, P.N2);
    expect(j.detail).toMatchObject({ ancien: 'Pharmacie Publiée Ancienne', nouveau: 'Pharmacie Publiée Nouvelle', statut: 'publiee' });
  });

  test('même nom, nom vide, fiche inconnue : refusés', async () => {
    expect((await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.N1}/nom`)).send({ nom: 'Pharmacie Nom Relu' }).expect(409)).body.erreur).toBe('meme-valeur');
    await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.N1}/nom`)).send({ nom: '   ' }).expect(400);
    await ecrire(admin, api().post(`${ADMIN}/pharmacies/00000000-0000-4000-8000-000000000000/nom`)).send({ nom: 'X' }).expect(404);
  });

  test('accès : sans session 401, sans CSRF 403, pharmacien 403', async () => {
    await api().post(`${ADMIN}/pharmacies/${P.N1}/nom`).send({ nom: 'Intrus' }).expect(401);
    await api().post(`${ADMIN}/pharmacies/${P.N1}/nom`).set('Cookie', admin.cookie).send({ nom: 'Intrus' }).expect(403);
    await rattacher('N', 'N1');
    await ecrire(S.N, api().post(`${ADMIN}/pharmacies/${P.N1}/nom`)).send({ nom: 'Intrus' }).expect(403);
    // Base : le pharmacien de la fiche ne change pas son nom, même en SQL direct.
    await expect(commeActeur(ctx, U.N, (tx) => tx.requete(`UPDATE annuaire.pharmacie SET nom = 'Intrus' WHERE id = $1`, [ID.N1])))
      .rejects.toMatchObject(REFUS);
    expect((await fiche('N1')).nom).toBe('Pharmacie Nom Relu');
  });
});

// ============================================================ 2. création d'une fiche
describe('2. Création d\'une fiche pour une demande d\'ajout', () => {
  let demande: string;
  beforeAll(async () => {
    await creer('D1', { nom: 'Pharmacie Ennasr Centrale', statut: 'publiee', lat: 36.71, ville: 'Ariana Ville' });
    demande = await pharmacien('AJ', { ajout: { nom: 'Pharmacie Ennasr Centre', adresse: '3 rue du Lac', ville: 'Ariana Ville', telephone: '+21671222333' } });
  });
  const corps = (sup: Record<string, unknown> = {}) => ({
    rattachementId: demande, nom: 'Pharmacie Ennasr Centre', rue: '3 rue du Lac', ville: 'Ariana Ville', gouvernorat: 12,
    telephone: '+21671222333', ...sup,
  });

  test('doublon probable (nom proche, même ville) : signalé, rien n\'est créé', async () => {
    const avant = await ctx.base.requete<{ n: number }>(`SELECT count(*)::int AS n FROM annuaire.pharmacie`);
    const r = await ecrire(admin, api().post(`${ADMIN}/pharmacies`)).send(corps()).expect(409);
    expect(r.body.erreur).toBe('doublons-probables');
    expect(r.body.pharmacies).toEqual([expect.objectContaining({ id: P.D1, nom: 'Pharmacie Ennasr Centrale', ville: 'Ariana Ville' })]);
    expect(r.body.pharmacies[0].similarite).toBeGreaterThanOrEqual(0.5);
    expect(await ctx.base.requete(`SELECT count(*)::int AS n FROM annuaire.pharmacie`)).toEqual(avant);
  });

  test('confirmée : fiche en attente de position, sans position ni publication, liée à la demande', async () => {
    const r = await ecrire(admin, api().post(`${ADMIN}/pharmacies`)).send(corps({ confirmerSansDoublon: true })).expect(201);
    expect(r.body).toMatchObject({ rattachementId: demande, pharmacie: { nom: 'Pharmacie Ennasr Centre', statutPublication: 'en-attente-position' } });
    const [p] = await ctx.base.requete<Record<string, unknown>>(
      `SELECT p.id, p.statut_publication, p.latitude, p.position_confirmee, p.sources, p.telephone_principal, r.statut AS demande
         FROM annuaire.pharmacie p JOIN prive.rattachement_pharmacien r ON r.pharmacie_id = p.id WHERE p.uuid = $1`, [r.body.pharmacie.id]);
    expect(p).toMatchObject({ statut_publication: 'en_attente_position', latitude: null, position_confirmee: false,
      sources: ['saisie_admin'], telephone_principal: '+21671222333', demande: 'en_attente' });
    P.AJ = r.body.pharmacie.id; ID.AJ = p.id as string;
    const [j] = await journal(ctx, P.AJ);
    expect(j).toMatchObject({ action: 'creer_fiche', acteur_id: idAdmin, detail: { rattachement: demande, doublonsSignales: [P.D1], confirmeSansDoublon: true } });
    // La demande se valide ensuite par la route existante.
    await ecrire(admin, api().post(`/api/admin/rattachements/${demande}/valider`)).expect(200);
    expect((await api().get(`/api/v1/pharmacies/${P.AJ}`).expect(404)).body).toEqual({ erreur: 'introuvable' });
  });

  test('demande déjà décidée, réclamation d\'une fiche existante : refusées', async () => {
    expect((await ecrire(admin, api().post(`${ADMIN}/pharmacies`)).send(corps({ confirmerSansDoublon: true })).expect(409)).body.erreur).toBe('deja-decidee');
    const reclamation = await pharmacien('RC', { pharmacieId: P.D1 });
    expect((await ecrire(admin, api().post(`${ADMIN}/pharmacies`)).send(corps({ rattachementId: reclamation, nom: 'Autre Nom Lointain' }))
      .expect(409)).body.erreur).toBe('pas-une-demande-d-ajout');
  });

  test('ville différente : pas de doublon ; champs inconnus, position et gouvernorat inconnu refusés (400)', async () => {
    const d = await pharmacien('AJ2', { ajout: { nom: 'Pharmacie Ennasr Centre', adresse: 'x', ville: 'Bizerte', telephone: '+21672000000' } });
    expect((await ecrire(admin, api().post(`${ADMIN}/pharmacies`)).send(corps({ rattachementId: d, ville: 'Bizerte', gouvernorat: 17 })).expect(400)).body)
      .toEqual({ erreur: 'donnees-invalides', champs: ['gouvernorat'] });
    await ecrire(admin, api().post(`${ADMIN}/pharmacies`)).send({ ...corps({ rattachementId: d, ville: 'Bizerte', gouvernorat: 23 }), latitude: 36.8 }).expect(400);
    await ecrire(admin, api().post(`${ADMIN}/pharmacies`)).send({ ...corps({ rattachementId: d, ville: 'Bizerte', gouvernorat: 23 }), statut: 'publiee' }).expect(400);
    await ecrire(admin, api().post(`${ADMIN}/pharmacies`)).send(corps({ rattachementId: d, ville: 'Bizerte', gouvernorat: 23 })).expect(201);
  });

  test('base : seul un administrateur crée une fiche, sans position ni statut (SQL direct)', async () => {
    const inserer = (sql: string) => ctx.base.transaction(async (tx) => {
      await tx.requete(`SELECT set_config('mawjoud.acteur_id', $1, true)`, [U.AJ]);
      await tx.requete(sql);
    });
    await expect(ctx.base.requete(`INSERT INTO annuaire.pharmacie (nom, ville) VALUES ('Intruse', 'Tunis')`)).rejects.toMatchObject(REFUS);
    await expect(inserer(`INSERT INTO annuaire.pharmacie (nom, ville) VALUES ('Intruse', 'Tunis')`)).rejects.toMatchObject(REFUS);
    await expect(commeActeur(ctx, idAdmin, (tx) => tx.requete(
      `INSERT INTO annuaire.pharmacie (nom, ville, latitude, longitude) VALUES ('Intruse', 'Tunis', 36.8, 10.1)`))).rejects.toMatchObject(REFUS);
    await expect(commeActeur(ctx, idAdmin, (tx) => tx.requete(
      `INSERT INTO annuaire.pharmacie (nom, ville, statut_publication) VALUES ('Intruse', 'Tunis', 'publiee')`))).rejects.toMatchObject(REFUS);
    await expect(commeActeur(ctx, idAdmin, (tx) => tx.requete(
      `INSERT INTO annuaire.pharmacie (nom, ville, sources) VALUES ('Intruse', 'Tunis', '{inventee}')`))).rejects.toMatchObject(CONTRAINTE);
    expect(await ctx.base.requete(`SELECT 1 FROM annuaire.pharmacie WHERE nom = 'Intruse'`)).toEqual([]);
  });
});

// ============================================================ 3. fusion
describe('3. Fusion de deux fiches', () => {
  let demandeF: string; let signalement: string;
  let histF: number;
  beforeAll(async () => {
    await creer('K', { nom: 'Pharmacie Fusion Conservée', statut: 'publiee', lat: 36.60 });
    await creer('F', { nom: 'Pharmacie Fusion Doublon', statut: 'publiee', lat: 36.61 });
    await creer('X', { nom: 'Pharmacie Fusion Tierce', statut: 'en_attente_position' });
    await rattacher('K', 'K'); await rattacher('F', 'F');
    // (c) M0 : F plus récente ; M1 : K plus récente ; M2 : F seule ; M3 : suivi sans statut sur F.
    await declarer('K', 'K', 0, 'en-rupture');
    await declarer('F', 'F', 0, 'disponible');
    await declarer('F', 'F', 1, 'disponible');
    await declarer('K', 'K', 1, 'quantite-limitee');
    await declarer('F', 'F', 2, 'quantite-limitee');
    await ecrire(S.F, api().put(`${PH}/pharmacies/${P.F}/suivis/${M[3]}`)).expect(200);
    await commeActeur(ctx, U.F, (tx) => tx.requete(
      `INSERT INTO annuaire.horaire (pharmacie_id, jour, ouverture, fermeture) VALUES ($1, 1, '08:00', '13:00'), ($1, 2, '08:00', '13:00')`, [ID.F]));
    demandeF = (await ecrire(S.F, api().post(`${PH}/pharmacies/${P.F}/position`)).send({ latitude: 36.612, longitude: 10.101 }).expect(201)).body.demande.id;
    await pharmacien('FA', { pharmacieId: P.F });
    const patient = await idCompteParEmail(ctx, await compteVerifie(ctx));
    [{ uuid: signalement }] = await ctx.base.requete<{ uuid: string }>(
      `INSERT INTO prive.signalement (pharmacie_id, auteur_id, type, texte) VALUES ($1, $2, 'adresse', 'Même pharmacie que la fiche voisine.') RETURNING uuid`,
      [ID.F, patient]);
    [{ n: histF }] = await ctx.base.requete<{ n: number }>(`SELECT count(*)::int AS n FROM annuaire.historique_stock WHERE pharmacie_id = $1`, [ID.F]);
  });

  test('(e) avec elle-même : refusé', async () => {
    const r = await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.K}/fusionner`)).send({ fusionneeId: P.K, motif: 'essai' }).expect(409);
    expect(r.body.erreur).toBe('meme-fiche');
  });

  test('motif obligatoire ; pharmacien refusé', async () => {
    await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.K}/fusionner`)).send({ fusionneeId: P.F }).expect(400);
    await ecrire(S.K, api().post(`${ADMIN}/pharmacies/${P.K}/fusionner`)).send({ fusionneeId: P.F, motif: 'essai' }).expect(403);
  });

  test('base : « fusionnee » ne s\'obtient que par une fusion (SQL direct, même administrateur)', async () => {
    await expect(commeActeur(ctx, idAdmin, (tx) => tx.requete(
      `UPDATE annuaire.pharmacie SET statut_publication = 'fusionnee', fusionnee_dans = $2 WHERE id = $1`, [ID.X, ID.K]))).rejects.toMatchObject(CONTRAINTE);
    // Une fusion annoncée pour une autre fiche ne vaut pas pour celle-ci.
    await expect(ctx.base.transaction(async (tx) => {
      await tx.requete(`SELECT set_config('mawjoud.acteur_id', $1, true), set_config('mawjoud.fusion', $2, true)`, [idAdmin, ID.F]);
      await tx.requete(`UPDATE annuaire.pharmacie SET statut_publication = 'fusionnee', fusionnee_dans = $2 WHERE id = $1`, [ID.X, ID.K]);
    })).rejects.toMatchObject(CONTRAINTE);
    // Ni par un pharmacien, même pendant une « fusion ».
    await expect(ctx.base.transaction(async (tx) => {
      await tx.requete(`SELECT set_config('mawjoud.acteur_id', $1, true), set_config('mawjoud.fusion', $2, true)`, [U.F, ID.F]);
      await tx.requete(`UPDATE annuaire.pharmacie SET statut_publication = 'fusionnee', fusionnee_dans = $2 WHERE id = $1`, [ID.F, ID.K]);
    })).rejects.toMatchObject(CONTRAINTE);
    // La copie d'une déclaration ne passe que si elle reproduit exactement une déclaration de la fiche fusionnée.
    await expect(ctx.base.transaction(async (tx) => {
      await tx.requete(`SELECT set_config('mawjoud.acteur_id', $1, true), set_config('mawjoud.fusion', $2, true)`, [idAdmin, ID.F]);
      await tx.requete(`INSERT INTO annuaire.stock (pharmacie_id, medicament_id, statut, declare_le, declare_par)
                        VALUES ($1, $2, 'disponible', now(), $3)`, [ID.X, MI[2], U.F]);
    })).rejects.toMatchObject(REFUS);
    expect((await fiche('F')).statut).toBe('publiee');
  });

  test('(d) tout ou rien : une panne en fin de fusion ne laisse aucune trace', async () => {
    const audit = ctx.app.get(AuditService);
    const original = audit.ecrire.bind(audit);
    const avant = { K: await stock('K'), F: await stock('F'), fk: await fiche('F') };
    audit.ecrire = (async (...a: Parameters<AuditService['ecrire']>) => {
      if (a[1] === 'fusionner') throw new Error('panne simulée');
      return original(...a);
    }) as AuditService['ecrire'];
    try {
      await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.K}/fusionner`)).send({ fusionneeId: P.F, motif: 'Doublon Tunidoc et OSM.' }).expect(500);
    } finally {
      audit.ecrire = original;
    }
    expect({ K: await stock('K'), F: await stock('F'), fk: await fiche('F') }).toEqual(avant);
    expect((await ctx.base.requete<{ p: string }>(`SELECT pharmacie_id AS p FROM prive.signalement WHERE uuid = $1`, [signalement]))[0].p).toBe(ID.F);
    expect((await ctx.base.requete<{ s: string }>(`SELECT statut AS s FROM prive.demande_position WHERE uuid = $1`, [demandeF]))[0].s).toBe('en_attente');
  });

  test('fusion réussie : bilan, F « fusionnee » avec renvoi vers K', async () => {
    const r = await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.K}/fusionner`)).send({ fusionneeId: P.F, motif: 'Doublon Tunidoc et OSM.' }).expect(200);
    expect(r.body.conservee).toMatchObject({ id: P.K, statutPublication: 'publiee' });
    expect(r.body.fusionnee).toMatchObject({ id: P.F, statutPublication: 'fusionnee', fusionneeDans: P.K });
    expect(r.body.bilan).toMatchObject({
      disponibilitesCopiees: 2, conflitsResolusParF: 1, conflitsGardesSurK: 1, suivisCopies: 1, horairesCopies: 2,
      signalementsDeplaces: 1, demandesPositionRemplacees: 1, rattachementsDeplaces: 1, rattachementsRetires: 1,
    });
    expect(await fiche('F')).toMatchObject({ statut: 'fusionnee', fusionnee_dans: ID.K });
    const jF = (await journal(ctx, P.F)).find((j) => j.action === 'fusionner');
    const jK = (await journal(ctx, P.K)).find((j) => j.action === 'fusionner');
    expect(jF).toMatchObject({ acteur_id: idAdmin, detail: { conservee: P.K, fusionnee: P.F, motif: 'Doublon Tunidoc et OSM.', statutAvant: 'publiee' } });
    expect(jK?.detail).toEqual(jF?.detail);
    // De quoi rattraper la fusion à la main : listes et valeur de K remplacée.
    const [kM0] = await ctx.base.requete<{ statut: string }>(
      `SELECT statut FROM annuaire.historique_stock WHERE pharmacie_id = $1 AND medicament_id = $2 AND declare_par = $3`, [ID.K, MI[0], U.K]);
    expect(kM0.statut).toBe('en_rupture');
    expect(jF?.detail.rattrapage).toMatchObject({
      disponibilites: expect.arrayContaining([
        { medicament: M[0], avantSurK: expect.objectContaining({ statut: 'en_rupture', declarePar: U.K }) },
        { medicament: M[2], avantSurK: null },
      ]),
      suivis: [M[3]], horairesCopies: true, signalements: [signalement], messages: [],
      demandesPositionRemplacees: [demandeF], rattachementsRetires: [expect.any(String)], rattachementsDeplaces: [expect.any(String)],
    });
  });

  test('(c) disponibilités : la déclaration la plus récente l\'emporte, déclarant d\'origine gardé', async () => {
    const k = await stock('K');
    expect(k[0]).toEqual({ statut: 'disponible', par: U.F });        // F plus récente
    expect(k[1]).toEqual({ statut: 'quantite_limitee', par: U.K });  // K plus récente
    expect(k[2]).toEqual({ statut: 'quantite_limitee', par: U.F });  // F seule
    expect(k[3]).toEqual({ statut: null, par: null });               // suivi
  });

  test('(b) rien n\'est perdu : historique, disponibilités, demandes et rattachements conservés ou rattachés à K', async () => {
    const f = await stock('F');
    expect(Object.keys(f).length).toBe(4);
    expect((await ctx.base.requete<{ n: number }>(`SELECT count(*)::int AS n FROM annuaire.historique_stock WHERE pharmacie_id = $1`, [ID.F]))[0].n).toBe(histF);
    const hK = await ctx.base.requete<{ m: string; par: string }>(
      `SELECT medicament_id AS m, declare_par AS par FROM annuaire.historique_stock WHERE pharmacie_id = $1 AND declare_par = $2`, [ID.K, U.F]);
    expect(hK.map((h) => MI.indexOf(h.m)).sort()).toEqual([0, 2]);
    expect((await ctx.base.requete(`SELECT statut, decide_par FROM prive.demande_position WHERE uuid = $1`, [demandeF]))[0])
      .toEqual({ statut: 'remplacee', decide_par: idAdmin });
    const ratt = await ctx.base.requete<{ u: string; p: string; statut: string; motif: string | null; conflit: boolean }>(
      `SELECT utilisateur_id AS u, pharmacie_id AS p, statut, motif_code AS motif, conflit FROM prive.rattachement_pharmacien
        WHERE utilisateur_id = ANY($1::bigint[]) ORDER BY id`, [[U.F, U.FA]]);
    expect(ratt).toEqual([
      { u: U.F, p: ID.F, statut: 'retiree', motif: 'pharmacie_attribuee', conflit: false },
      { u: U.FA, p: ID.K, statut: 'en_attente', motif: null, conflit: true },
    ]);
    expect(await ctx.base.requete(`SELECT pharmacie_id FROM prive.signalement WHERE uuid = $1`, [signalement])).toEqual([{ pharmacie_id: ID.K }]);
    expect(await ctx.base.requete(`SELECT count(*)::int AS n FROM annuaire.horaire WHERE pharmacie_id = $1`, [ID.F])).toEqual([{ n: 2 }]);
    expect(await ctx.base.requete(`SELECT count(*)::int AS n FROM annuaire.horaire WHERE pharmacie_id = $1`, [ID.K])).toEqual([{ n: 2 }]);
    // Le pharmacien de K garde la main ; celui de F n'a plus de pharmacie.
    await declarer('K', 'K', 2, 'disponible');
    await ecrire(S.F, api().put(`${PH}/pharmacies/${P.F}/disponibilites/${M[0]}`)).send({ statut: 'en-rupture' }).expect(404);
  });

  test('(a) la fiche fusionnée ne se modifie plus et ne se republie pas', async () => {
    expect((await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.F}/nom`)).send({ nom: 'Revenante', nomRelu: true }).expect(409)).body.erreur).toBe('fiche-fusionnee');
    for (const statut of ['publiee', 'pret-a-publier', 'fermee']) {
      await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.F}/statut`)).send({ statut }).expect(409);
    }
    for (const sql of [
      `UPDATE annuaire.pharmacie SET telephone_principal = '+21671999999' WHERE id = $1`,
      `UPDATE annuaire.pharmacie SET nom = 'Revenante' WHERE id = $1`,
      `UPDATE annuaire.pharmacie SET statut_publication = 'publiee', fusionnee_dans = NULL WHERE id = $1`,
      `INSERT INTO annuaire.horaire (pharmacie_id, jour, ouverture, fermeture) VALUES ($1, 3, '08:00', '12:00')`,
      `DELETE FROM annuaire.horaire WHERE pharmacie_id = $1`,
    ]) {
      await expect(commeActeur(ctx, idAdmin, (tx) => tx.requete(sql, [ID.F]))).rejects.toMatchObject(REFUS);
    }
    await expect(commeActeur(ctx, idAdmin, (tx) => tx.requete(
      `UPDATE annuaire.stock SET statut = 'en_rupture', declare_le = now(), declare_par = $2 WHERE pharmacie_id = $1`, [ID.F, U.F])))
      .rejects.toMatchObject(REFUS);
    expect(await fiche('F')).toMatchObject({ nom: 'Pharmacie Fusion Doublon', statut: 'fusionnee', fusionnee_dans: ID.K });
  });

  test('(a) personne ne sort une fiche de « fusionnee » : ni mawjoud_api, ni un pharmacien, ni un administrateur par l\'API', async () => {
    const sortir = `UPDATE annuaire.pharmacie SET statut_publication = 'pret_a_publier', fusionnee_dans = NULL WHERE id = $1`;
    // mawjoud_api sans acteur.
    await expect(ctx.base.requete(sortir, [ID.F])).rejects.toMatchObject(REFUS);
    // mawjoud_api au nom d'un pharmacien (celui de F, celui de K), même en annonçant une « fusion ».
    for (const p of [U.F, U.K]) {
      await expect(commeActeur(ctx, p, (tx) => tx.requete(sortir, [ID.F]))).rejects.toMatchObject(REFUS);
      await expect(ctx.base.transaction(async (tx) => {
        await tx.requete(`SELECT set_config('mawjoud.acteur_id', $1, true), set_config('mawjoud.fusion', $2, true)`, [p, ID.F]);
        await tx.requete(sortir, [ID.F]);
      })).rejects.toMatchObject(REFUS);
    }
    // mawjoud_api au nom d'un administrateur, avec ou sans « fusion » annoncée.
    await expect(commeActeur(ctx, idAdmin, (tx) => tx.requete(sortir, [ID.F]))).rejects.toMatchObject(REFUS);
    await expect(ctx.base.transaction(async (tx) => {
      await tx.requete(`SELECT set_config('mawjoud.acteur_id', $1, true), set_config('mawjoud.fusion', $2, true)`, [idAdmin, ID.F]);
      await tx.requete(sortir, [ID.F]);
    })).rejects.toMatchObject(REFUS);
    // Par l'API : administrateur (toutes les routes qui touchent une fiche), pharmacien.
    for (const statut of ['en-attente-position', 'a-relire', 'pret-a-publier', 'publiee', 'non-publiable', 'fermee']) {
      await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.F}/statut`)).send({ statut, motif: 'essai de sortie' }).expect(409);
    }
    expect((await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.F}/relire`)).expect(409)).body.erreur).toBe('fiche-fusionnee');
    await ecrire(S.F, api().post(`${ADMIN}/pharmacies/${P.F}/statut`)).send({ statut: 'publiee' }).expect(403);
    await ecrire(S.K, api().post(`${ADMIN}/pharmacies/${P.F}/statut`)).send({ statut: 'publiee' }).expect(403);
    expect(await fiche('F')).toMatchObject({ statut: 'fusionnee', fusionnee_dans: ID.K });
  });

  test('(e) avec une fiche déjà fusionnée, dans un sens comme dans l\'autre : refusé', async () => {
    for (const [k, f] of [['X', 'F'], ['F', 'X']]) {
      const r = await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P[k]}/fusionner`)).send({ fusionneeId: P[f], motif: 'essai' }).expect(409);
      expect(r.body).toEqual({ erreur: 'deja-fusionnee', fiche: P.F });
    }
  });

  test('(f) aucune des deux n\'apparaît en double dans l\'API publique', async () => {
    await api().get(`/api/v1/pharmacies/${P.F}`).expect(404);
    await api().get(`/api/v1/pharmacies/${P.K}`).expect(200);
    const liste = await api().get('/api/v1/pharmacies').query({ nom: 'Pharmacie Fusion' }).expect(200);
    expect(liste.body.elements.map((e: { id: string }) => e.id)).toEqual([P.K]);
    const dispo = await api().get(`/api/v1/medicaments/${M[0]}/pharmacies`).expect(200);
    const ids = dispo.body.elements.map((e: { pharmacie?: { id: string }; id?: string }) => e.pharmacie?.id ?? e.id);
    expect(ids.filter((i: string) => i === P.K || i === P.F)).toEqual([P.K]);
    const carte = await api().get('/api/v1/pharmacies/carte').query({ sud: 36.5, ouest: 10, nord: 36.7, est: 10.2, zoom: 14 }).expect(200);
    const points = (carte.body.points as { id: string }[]).map((p) => p.id);
    expect(points).toContain(P.K);
    expect(points).not.toContain(P.F);
  });
});

// ============================================================ 4. suspension
describe('4. Suspension et réactivation d\'un compte', () => {
  let emailP: string; let uuidP: string; let ancienne: Session;
  beforeAll(async () => {
    emailP = await compteVerifie(ctx);
    uuidP = await uuidDe(ctx, emailP);
    ancienne = await connecter(ctx, emailP);
  });

  test('motif obligatoire', async () => {
    await ecrire(admin, api().post(`${ADMIN}/comptes/${uuidP}/suspendre`)).send({}).expect(400);
    await ecrire(admin, api().post(`${ADMIN}/comptes/${uuidP}/suspendre`)).send({ motif: ' ' }).expect(400);
  });

  test('effet immédiat : sessions fermées, données gardées, journalisé', async () => {
    await api().get('/api/comptes/moi').set('Cookie', ancienne.cookie).expect(200);
    const r = await ecrire(admin, api().post(`${ADMIN}/comptes/${uuidP}/suspendre`)).send({ motif: 'Abus répétés du formulaire.' }).expect(200);
    expect(r.body).toEqual({ id: uuidP, suspendu: true, sessionsFermees: 1 });
    await api().get('/api/comptes/moi').set('Cookie', ancienne.cookie).expect(401);
    expect(await ctx.base.requete(`SELECT email, suspendu FROM prive.utilisateur WHERE uuid = $1`, [uuidP])).toEqual([{ email: emailP, suspendu: true }]);
    const [j] = await journal(ctx, uuidP);
    expect(j).toMatchObject({ action: 'suspendre', acteur_id: idAdmin, detail: { motif: 'Abus répétés du formulaire.', role: 'patient', sessionsFermees: 1 } });
  });

  test('il se reconnecte et voit son état, sans pouvoir agir', async () => {
    const s = await connecter(ctx, emailP);
    expect((await api().get('/api/comptes/moi').set('Cookie', s.cookie).expect(200)).body).toMatchObject({ suspendu: true });
    await ecrire(s, api().post('/api/v1/alertes')).send({ medicamentId: M[0], gouvernorat: null, consentement: true }).expect(403);
  });

  test('déjà suspendu, rétablir sans motif, rétablir un compte actif : refusés ; réactivation journalisée', async () => {
    expect((await ecrire(admin, api().post(`${ADMIN}/comptes/${uuidP}/suspendre`)).send({ motif: 'encore' }).expect(409)).body.erreur).toBe('deja-suspendu');
    await ecrire(admin, api().post(`${ADMIN}/comptes/${uuidP}/retablir`)).send({}).expect(400);
    expect((await ecrire(admin, api().post(`${ADMIN}/comptes/${uuidP}/retablir`)).send({ motif: 'Erreur de ma part.' }).expect(200)).body)
      .toEqual({ id: uuidP, suspendu: false });
    expect((await ecrire(admin, api().post(`${ADMIN}/comptes/${uuidP}/retablir`)).send({ motif: 'encore' }).expect(409)).body.erreur).toBe('pas-suspendu');
    expect((await journal(ctx, uuidP))[0]).toMatchObject({ action: 'retablir', detail: { motif: 'Erreur de ma part.' } });
    const s = await connecter(ctx, emailP);
    expect((await api().get('/api/comptes/moi').set('Cookie', s.cookie).expect(200)).body.suspendu ?? false).toBe(false);
  });

  test('un administrateur ne se suspend pas lui-même', async () => {
    const moi = await uuidDe(ctx, emailAdmin);
    expect((await ecrire(admin, api().post(`${ADMIN}/comptes/${moi}/suspendre`)).send({ motif: 'essai' }).expect(409)).body.erreur).toBe('soi-meme');
  });

  test('jamais le dernier administrateur actif, même avec deux suspensions croisées en même temps', async () => {
    const emailB = await administrateur(ctx);
    const b = await connecter(ctx, emailB);
    const [uA, uB] = [await uuidDe(ctx, emailAdmin), await uuidDe(ctx, emailB)];
    // Base de test partagée : les autres administrateurs actifs sont mis de côté le temps du test, puis rétablis.
    const autres = (await ctx.base.requete<{ id: string }>(
      `UPDATE prive.utilisateur SET suspendu = true WHERE role = 'administrateur' AND NOT suspendu AND uuid <> ALL($1::uuid[]) RETURNING id`,
      [[uA, uB]])).map((l) => l.id);
    try {
      const service = ctx.app.get(AdministrationGeneraleService);
      const idDe = async (u: string) => (await ctx.base.requete<{ id: string }>(`SELECT id FROM prive.utilisateur WHERE uuid = $1`, [u]))[0].id;
      const [idA, idB] = [await idDe(uA), await idDe(uB)];
      const actifs = async () => (await ctx.base.requete<{ uuid: string }>(
        `SELECT uuid FROM prive.utilisateur WHERE role = 'administrateur' AND NOT suspendu`)).map((l) => l.uuid);

      // Par l'API : la seconde requête est refusée, soit par la règle (409), soit parce que sa session vient d'être fermée (401).
      const [r1, r2] = await Promise.all([
        ecrire(admin, api().post(`${ADMIN}/comptes/${uB}/suspendre`)).send({ motif: 'croisé A' }),
        ecrire(b, api().post(`${ADMIN}/comptes/${uA}/suspendre`)).send({ motif: 'croisé B' }),
      ]);
      const statuts = [r1.status, r2.status];
      expect(statuts.filter((s) => s === 200)).toHaveLength(1);
      expect([401, 409]).toContain(statuts.find((s) => s !== 200));
      const [survivant] = await actifs();
      expect(await actifs()).toHaveLength(1);
      const autre = survivant === uA ? uB : uA;
      await ecrire(survivant === uA ? admin : b, api().post(`${ADMIN}/comptes/${autre}/retablir`)).send({ motif: 'fin du test croisé' }).expect(200);

      // Vraie course : les deux demandes ont déjà passé la garde (appel direct du service, en parallèle).
      const resultats = await Promise.allSettled([
        service.suspendre({ id: idA } as CompteConnecte, uB, 'course A'),
        service.suspendre({ id: idB } as CompteConnecte, uA, 'course B'),
      ]);
      expect(resultats.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      const refus = resultats.find((r) => r.status === 'rejected') as PromiseRejectedResult;
      expect(refus.reason).toMatchObject({ status: 409, response: { erreur: 'dernier-administrateur' } });
      expect(await actifs()).toHaveLength(1);
      const [reste] = await actifs();
      await service.retablir({ id: reste === uA ? idA : idB } as CompteConnecte, reste === uA ? uB : uA, 'fin de la course');
      expect((await actifs()).sort()).toEqual([uA, uB].sort());
    } finally {
      if (autres.length) await ctx.base.requete(`UPDATE prive.utilisateur SET suspendu = false WHERE id = ANY($1::bigint[])`, [autres]);
    }
    admin = await connecter(ctx, emailAdmin);
  });
});

// ============================================================ 5. lecture
describe('5. Lecture : comptes et journal d\'audit', () => {
  test('comptes filtrés par rôle et statut, sans mot de passe, empreinte ni jeton', async () => {
    const r = await api().get(`${ADMIN}/comptes`).query({ role: 'pharmacien', taille: 50 }).set('Cookie', admin.cookie).expect(200);
    expect(r.body.total).toBeGreaterThan(0);
    for (const c of r.body.elements) {
      expect(c.role).toBe('pharmacien');
      expect(Object.keys(c).sort()).toEqual(['creeLe', 'email', 'emailVerifie', 'id', 'pharmacie', 'role', 'suspendu']);
    }
    expect(r.body.elements.find((c: { id: string }) => c.id === undefined)).toBeUndefined();
    const brut = JSON.stringify(r.body);
    for (const interdit of ['argon2', 'mot_de_passe', 'motDePasse', 'hache', 'jeton', 'session']) expect(brut).not.toContain(interdit);
    const kPh = await api().get(`${ADMIN}/comptes`).query({ email: E.K }).set('Cookie', admin.cookie).expect(200);
    expect(kPh.body.elements).toEqual([expect.objectContaining({ email: E.K, role: 'pharmacien', pharmacie: { id: P.K, nom: 'Pharmacie Fusion Conservée' } })]);
    const susp = await api().get(`${ADMIN}/comptes`).query({ statut: 'suspendu' }).set('Cookie', admin.cookie).expect(200);
    for (const c of susp.body.elements) expect(c.suspendu).toBe(true);
    await api().get(`${ADMIN}/comptes`).query({ role: 'super' }).set('Cookie', admin.cookie).expect(400);
  });

  test('journal paginé et filtrable, en lecture seule', async () => {
    const r = await api().get(`${ADMIN}/journal`).query({ action: 'fusionner', cibleType: 'pharmacie', cibleId: P.F }).set('Cookie', admin.cookie).expect(200);
    expect(r.body.total).toBe(1);
    expect(r.body.elements[0]).toMatchObject({ action: 'fusionner', cibleId: P.F, acteur: { email: emailAdmin }, detail: { conservee: P.K } });
    const idA = await uuidDe(ctx, emailAdmin);
    const page1 = await api().get(`${ADMIN}/journal`).query({ acteur: idA, taille: 2, page: 1 }).set('Cookie', admin.cookie).expect(200);
    const page2 = await api().get(`${ADMIN}/journal`).query({ acteur: idA, taille: 2, page: 2 }).set('Cookie', admin.cookie).expect(200);
    expect(page1.body.total).toBeGreaterThan(4);
    expect(page1.body.elements).toHaveLength(2);
    expect(page2.body.elements[0].id).not.toBe(page1.body.elements[0].id);
    const jour = new Date().toLocaleDateString('sv-SE'); // AAAA-MM-JJ, heure locale
    expect((await api().get(`${ADMIN}/journal`).query({ depuis: jour, jusqua: jour, acteur: idA }).set('Cookie', admin.cookie).expect(200)).body.total)
      .toBe(page1.body.total);
    expect((await api().get(`${ADMIN}/journal`).query({ jusqua: '2020-01-01' }).set('Cookie', admin.cookie).expect(200)).body.total).toBe(0);
    await api().get(`${ADMIN}/journal`).query({ action: 'inventee' }).set('Cookie', admin.cookie).expect(400);
    await api().get(`${ADMIN}/journal`).query({ depuis: 'hier' }).set('Cookie', admin.cookie).expect(400);
    // Lecture seule : aucune route d'écriture, et la base refuse toute modification au compte de l'API.
    await ecrire(admin, api().delete(`${ADMIN}/journal`)).expect(404);
    await expect(ctx.base.requete(`UPDATE prive.journal_audit SET detail = '{}' WHERE cible_id = $1`, [P.F])).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`DELETE FROM prive.journal_audit WHERE cible_id = $1`, [P.F])).rejects.toMatchObject(REFUS);
  });

  test('accès : sans session 401, patient et pharmacien 403', async () => {
    await api().get(`${ADMIN}/comptes`).expect(401);
    await api().get(`${ADMIN}/journal`).set('Cookie', S.K.cookie).expect(403);
    const patient = await connecter(ctx, await compteVerifie(ctx));
    await api().get(`${ADMIN}/comptes`).set('Cookie', patient.cookie).expect(403);
  });
});
