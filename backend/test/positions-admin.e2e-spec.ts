import request from 'supertest';
import { lireConfiguration } from '../src/config/configuration.js';
import {
  administrateur, commeActeur, compteVerifie, connecter, demarrer, fixtures, idCompteParEmail, journal, type Contexte, type Session,
} from './aide.js';

/**
 * Partie 8, sur mawjoud_test : droits de la base, demandes de position, validation, publication.
 * Pharmacies : PA (circuit complet), PB (R9), PV (publiée, repère de proximité), PP (publiée, déplacée),
 * PR (nom à relire), PN (en attente, nom à relire), PS (pharmacien suspendu).
 */
let ctx: Contexte;
const api = () => request(ctx.http);
const ADMIN = '/api/v1/admin';
const PH = '/api/v1/pharmacien';
const REFUS = { code: '42501' };
const CONTRAINTE = { code: '23514' };

let admin: Session; let idAdmin: string;
const P: Record<string, string> = {};        // uuid
const ID: Record<string, string> = {};       // id interne
const S: Record<string, Session> = {};       // sessions des pharmaciens
const U: Record<string, string> = {};        // id interne des pharmaciens

const ecrire = (s: Session, r: request.Test) => r.set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf);

async function creer(cle: string, v: { nom: string; statut: string; lat?: number; lng?: number; nomAVerifier?: boolean }) {
  const [p] = await fixtures(ctx, (tx) => tx.requete<{ uuid: string; id: string }>(
    `INSERT INTO annuaire.pharmacie (nom, ville, gouvernorat_code, latitude, longitude, position_confirmee, source_gps,
                                     precision_gps, statut_publication, nom_a_verifier, telephone_principal)
     VALUES ($1, 'Tunis', 11, $2, $3, $4, $5, $6, $7, $8, '+21671000000') RETURNING uuid, id`,
    [v.nom, v.lat ?? null, v.lng ?? null, v.lat !== undefined, v.lat !== undefined ? 'tunidoc' : null,
     v.lat !== undefined ? 'exact' : 'inconnu', v.statut, v.nomAVerifier ?? false]));
  P[cle] = p.uuid; ID[cle] = p.id;
}

async function rattacher(cle: string, pharmacie: string) {
  const email = await compteVerifie(ctx, 'pharmaciens');
  const s = await connecter(ctx, email);
  const d = await ecrire(s, api().post('/api/pharmacien/rattachement')).send({ pharmacieId: P[pharmacie] }).expect(201);
  await ecrire(admin, api().post(`/api/admin/rattachements/${d.body.id}/valider`)).expect(200);
  S[cle] = await connecter(ctx, email);
  U[cle] = await idCompteParEmail(ctx, email);
}

const fiche = async (cle: string) => (await ctx.base.requete<{ latitude: number | null; longitude: number | null; confirmee: boolean;
  statut: string; source: string | null; nom_a_verifier: boolean }>(
  `SELECT latitude, longitude, position_confirmee AS confirmee, statut_publication AS statut, source_gps AS source, nom_a_verifier
     FROM annuaire.pharmacie WHERE id = $1`, [ID[cle]]))[0];

beforeAll(async () => {
  ctx = await demarrer();
  const emailAdmin = await administrateur(ctx);
  admin = await connecter(ctx, emailAdmin);
  idAdmin = await idCompteParEmail(ctx, emailAdmin);
  await creer('PA', { nom: 'Pharmacie Circuit', statut: 'en_attente_position' });
  await creer('PB', { nom: 'Pharmacie Autre B', statut: 'en_attente_position' });
  await creer('PV', { nom: 'Pharmacie Repère Publiée', statut: 'publiee', lat: 36.79, lng: 10.17 });
  await creer('PP', { nom: 'Pharmacie Publiée Mobile', statut: 'publiee', lat: 36.77, lng: 10.15 });
  await creer('PR', { nom: 'Pharmacie Nom Personne', statut: 'a_relire', lat: 36.75, lng: 10.12, nomAVerifier: true });
  await creer('PN', { nom: 'Pharmacie Attente Nom', statut: 'en_attente_position', nomAVerifier: true });
  await creer('PS', { nom: 'Pharmacie Suspendue', statut: 'en_attente_position' });
  await rattacher('A', 'PA'); await rattacher('B', 'PB'); await rattacher('C', 'PP');
  await rattacher('D', 'PN'); await rattacher('E', 'PS');
  await ctx.base.requete(`UPDATE prive.utilisateur SET suspendu = true WHERE id = $1`, [U.E]);
});
afterAll(async () => {
  // Base de test partagée par tous les fichiers : les fiches publiées ici repassent à « pret_a_publier »
  // (transition autorisée), pour ne pas fausser les comptes des tests de l'API publique.
  await commeActeur(ctx, idAdmin, (tx) => tx.requete(
    `UPDATE annuaire.pharmacie SET statut_publication = 'pret_a_publier' WHERE id = ANY($1::bigint[]) AND statut_publication = 'publiee'`,
    [Object.values(ID)]));
  await ctx.comptes.travauxTermines();
  await ctx.app.close();
});

// ============================================================ priorité 1 : la base
describe('a) Droits de mawjoud_api sur annuaire.pharmacie (SQL direct)', () => {
  // nom et fusionnee_dans sont accordés depuis 035 (correction, fusion) : leurs contrôles sont dans administration-generale.
  test('ni INSERT, ni DELETE, ni UPDATE hors des colonnes accordées', async () => {
    await expect(ctx.base.requete(`INSERT INTO annuaire.pharmacie (nom, ville) VALUES ('Intruse', 'Tunis')`)).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`DELETE FROM annuaire.pharmacie WHERE id = $1`, [ID.PB])).rejects.toMatchObject(REFUS);
    for (const colonne of ['rue', 'ville', 'gouvernorat_code', 'sources', 'quartier', 'code_postal', 'id_source']) {
      await expect(commeActeur(ctx, idAdmin, (tx) => tx.requete(`UPDATE annuaire.pharmacie SET ${colonne} = ${colonne} WHERE id = $1`, [ID.PB])))
        .rejects.toMatchObject(REFUS);
    }
    const [{ n }] = await ctx.base.requete<{ n: number }>(`SELECT count(*)::int AS n FROM annuaire.pharmacie WHERE uuid = $1`, [P.PB]);
    expect(n).toBe(1);
  });
});

describe('b) Champs modifiables par le pharmacien, contrôlés par la base (SQL direct)', () => {
  const tel = (cle: string, acteur: string | null, valeur = '+21671555555') => acteur === null
    ? ctx.base.requete(`UPDATE annuaire.pharmacie SET telephone_principal = $2 WHERE id = $1`, [ID[cle], valeur])
    : commeActeur(ctx, acteur, (tx) => tx.requete(`UPDATE annuaire.pharmacie SET telephone_principal = $2 WHERE id = $1`, [ID[cle], valeur]));

  test('témoin : le pharmacien change le téléphone et la garde de SA pharmacie', async () => {
    await tel('PA', U.A);
    await commeActeur(ctx, U.A, (tx) => tx.requete(`UPDATE annuaire.pharmacie SET garde = 'nuit', telephones_autres = '{}' WHERE id = $1`, [ID.PA]));
    expect((await ctx.base.requete<{ t: string }>(`SELECT telephone_principal AS t FROM annuaire.pharmacie WHERE id = $1`, [ID.PA]))[0].t).toBe('+21671555555');
  });

  test('sans acteur, sur la pharmacie d\'un autre, compte suspendu, compte patient : refusé', async () => {
    await expect(tel('PA', null)).rejects.toMatchObject(REFUS);
    await expect(tel('PB', U.A)).rejects.toMatchObject(REFUS);
    await expect(tel('PS', U.E)).rejects.toMatchObject(REFUS);
    const patient = await idCompteParEmail(ctx, await compteVerifie(ctx));
    await expect(tel('PA', patient)).rejects.toMatchObject(REFUS);
  });

  test('le pharmacien ne change ni la position, ni le statut, ni la relecture du nom de sa propre pharmacie', async () => {
    for (const set of [`latitude = 36.8, longitude = 10.2, source_gps = 'saisie_pharmacien'`, `position_confirmee = true`,
      `statut_publication = 'non_publiable'`, `nom_a_verifier = true`, `precision_gps = 'exact'`]) {
      await expect(commeActeur(ctx, U.A, (tx) => tx.requete(`UPDATE annuaire.pharmacie SET ${set} WHERE id = $1`, [ID.PA]), 'essai'))
        .rejects.toMatchObject(REFUS);
    }
    expect(await fiche('PA')).toMatchObject({ latitude: null, statut: 'en_attente_position', nom_a_verifier: false });
  });

  test('horaires : seulement ceux de sa pharmacie, jamais sans acteur', async () => {
    const plage = (cle: string) => `INSERT INTO annuaire.horaire (pharmacie_id, jour, ouverture, fermeture) VALUES (${Number(ID[cle])}, 1, '08:00', '12:00')`;
    await commeActeur(ctx, U.A, (tx) => tx.requete(plage('PA')));
    await expect(commeActeur(ctx, U.A, (tx) => tx.requete(plage('PB')))).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(plage('PB'))).rejects.toMatchObject(REFUS);
    await expect(commeActeur(ctx, U.B, (tx) => tx.requete(`DELETE FROM annuaire.horaire WHERE pharmacie_id = $1`, [ID.PA]))).rejects.toMatchObject(REFUS);
    const [{ n }] = await ctx.base.requete<{ n: number }>(`SELECT count(*)::int AS n FROM annuaire.horaire WHERE pharmacie_id = $1`, [ID.PA]);
    expect(n).toBe(1); // la plage de PA est toujours là
  });
});

describe('c) R9 sur les demandes de position (migration 028)', () => {
  test('SQL direct : une demande pour la pharmacie d\'un autre est refusée ; témoin sur la sienne', async () => {
    await expect(ctx.base.requete(
      `INSERT INTO prive.demande_position (pharmacie_id, demandeur_id, latitude, longitude) VALUES ($1, $2, 36.8, 10.2)`, [ID.PB, U.A]))
      .rejects.toMatchObject(REFUS);
    const [d] = await ctx.base.requete<{ id: string }>(
      `INSERT INTO prive.demande_position (pharmacie_id, demandeur_id, latitude, longitude) VALUES ($1, $2, 36.8, 10.2) RETURNING id`, [ID.PB, U.B]);
    await ctx.base.requete(`UPDATE prive.demande_position SET statut = 'refusee', motif_refus = 'témoin', decide_le = now() WHERE id = $1`, [d.id]);
  });

  test('API : 404 comme une pharmacie inexistante, tentative journalisée', async () => {
    const r = await ecrire(S.A, api().post(`${PH}/pharmacies/${P.PB}/position`)).send({ latitude: 36.8, longitude: 10.2 }).expect(404);
    expect(r.body).toEqual({ erreur: 'introuvable' });
    await api().get(`${PH}/pharmacies/${P.PB}/position`).set('Cookie', S.A.cookie).expect(404);
    const traces = (await journal(ctx, P.PB)).filter((j) => j.action === 'acces_refuse');
    expect(traces.map((t) => t.detail.operation)).toEqual(expect.arrayContaining(['proposer_position', 'lire_position']));
  });

  test('une demande ne se modifie pas et ne se supprime pas (ajout seul)', async () => {
    const [d] = await ctx.base.requete<{ id: string }>(`SELECT id FROM prive.demande_position WHERE pharmacie_id = $1 LIMIT 1`, [ID.PB]);
    await expect(ctx.base.requete(`UPDATE prive.demande_position SET latitude = 36.9 WHERE id = $1`, [d.id])).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`UPDATE prive.demande_position SET statut = 'en_attente', decide_le = NULL WHERE id = $1`, [d.id])).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`DELETE FROM prive.demande_position WHERE id = $1`, [d.id])).rejects.toMatchObject(REFUS);
  });
});

// ============================================================ priorité 2 : demande du pharmacien
describe('Demande de position (pharmacien)', () => {
  test('proposer ne change pas la fiche ; une nouvelle demande remplace l\'ancienne, conservée', async () => {
    const r1 = await ecrire(S.A, api().post(`${PH}/pharmacies/${P.PA}/position`)).send({ latitude: 36.81, longitude: 10.19, precisionMetres: 8 }).expect(201);
    expect(r1.body.demande).toMatchObject({ etat: 'en-attente', latitude: 36.81, longitude: 10.19 });
    const r2 = await ecrire(S.A, api().post(`${PH}/pharmacies/${P.PA}/position`))
      .send({ latitude: 36.8123456789, longitude: 10.1987654321, commentaire: 'Devant la mosquée' }).expect(201);
    expect(r2.body.demande).toMatchObject({ latitude: 36.812346, longitude: 10.198765 }); // 6 décimales
    const demandes = await ctx.base.requete<{ uuid: string; statut: string }>(
      `SELECT uuid, statut FROM prive.demande_position WHERE pharmacie_id = $1 ORDER BY id`, [ID.PA]);
    expect(demandes.map((d) => d.statut)).toEqual(['remplacee', 'en_attente']);
    expect(await fiche('PA')).toMatchObject({ latitude: null, confirmee: false, statut: 'en_attente_position' });
    const etat = await api().get(`${PH}/pharmacies/${P.PA}/position`).set('Cookie', S.A.cookie).expect(200);
    expect(etat.body).toMatchObject({ demande: { id: r2.body.demande.id, etat: 'en-attente', commentaire: 'Devant la mosquée' }, positionActuelle: null });
    expect((await journal(ctx, r2.body.demande.id))[0]).toMatchObject({ action: 'proposer_position', detail: { remplace: [r1.body.demande.id] } });
  });

  test('autre pharmacie publiée à moins de 15 m : 409 avec la liste, sauf confirmation explicite', async () => {
    const pres = { latitude: 36.79003, longitude: 10.17003 }; // environ 4 m de PV
    const r = await ecrire(S.D, api().post(`${PH}/pharmacies/${P.PN}/position`)).send(pres).expect(409);
    expect(r.body.erreur).toBe('position-proche');
    expect(r.body.pharmacies[0]).toMatchObject({ id: P.PV, nom: 'Pharmacie Repère Publiée' });
    expect(r.body.pharmacies[0].distanceM).toBeLessThan(15);
    const ok = await ecrire(S.D, api().post(`${PH}/pharmacies/${P.PN}/position`)).send({ ...pres, confirmerProximite: true }).expect(201);
    expect(ok.body.avertissement.pharmacies[0].id).toBe(P.PV);
  });

  test.each([
    [{ latitude: 40, longitude: 10 }, 'latitude'], [{ latitude: 36.8, longitude: 13 }, 'longitude'],
    [{ latitude: '36.8', longitude: 10.2 }, 'latitude'], [{ latitude: 36.8 }, 'longitude'],
    [{ latitude: 36.8, longitude: 10.2, precisionMetres: 80 }, 'precisionMetres'],
    [{ latitude: 36.8, longitude: 10.2, statutPublication: 'publiee' }, 'statutPublication'],
  ])('position invalide %j → 400', async (corps, champ) => {
    const r = await ecrire(S.A, api().post(`${PH}/pharmacies/${P.PA}/position`)).send(corps).expect(400);
    expect(r.body.champs).toContain(champ);
  });

  test('seuils réglables : précision GPS maximale lue dans la configuration', async () => {
    const config = lireConfiguration();
    const autre = await demarrer({ positions: { ...config.positions, precisionMaxM: 5 } });
    try {
      const r = await request(autre.http).post(`${PH}/pharmacies/${P.PA}/position`).set('Cookie', S.A.cookie).set('X-XSRF-TOKEN', S.A.csrf)
        .send({ latitude: 36.8, longitude: 10.2, precisionMetres: 8 }).expect(400);
      expect(r.body).toEqual({ erreur: 'donnees-invalides', champs: ['precisionMetres'], precisionMaxM: 5 });
    } finally {
      await autre.app.close();
    }
    expect(config.positions).toEqual({ rayonProximiteM: 15, precisionMaxM: 50, decimales: 6 });
  });

  test('compte suspendu : refusé', async () => {
    await ecrire(S.E, api().post(`${PH}/pharmacies/${P.PS}/position`)).send({ latitude: 36.8, longitude: 10.2 }).expect(403);
  });
});

// ============================================================ priorité 3 : validation
describe('Accès à l\'administration', () => {
  test('pharmacien 403 ; sans session 401 ; administrateur sans CSRF 403', async () => {
    await api().get(`${ADMIN}/demandes-position`).set('Cookie', S.A.cookie).expect(403);
    await api().get(`${ADMIN}/pharmacies`).expect(401);
    const r = await api().post(`${ADMIN}/pharmacies/${P.PA}/statut`).set('Cookie', admin.cookie).send({ statut: 'fermee' }).expect(403);
    expect(r.body).toEqual({ erreur: 'csrf' });
    await ecrire(S.A, api().post(`${ADMIN}/pharmacies/${P.PA}/statut`)).send({ statut: 'publiee' }).expect(403);
  });
});

describe('Validation des positions', () => {
  test('file des demandes : position proposée, actuelle, distance, pharmacies proches, filtre', async () => {
    const r = await api().get(`${ADMIN}/demandes-position`).set('Cookie', admin.cookie).expect(200);
    const pa = r.body.elements.find((e: { pharmacie: { id: string } }) => e.pharmacie.id === P.PA);
    expect(pa).toMatchObject({ proposee: { latitude: 36.812346, longitude: 10.198765 }, actuelle: null, distanceM: null,
      pharmacie: { nom: 'Pharmacie Circuit', statutPublication: 'en-attente-position' }, commentaire: 'Devant la mosquée' });
    const pn = r.body.elements.find((e: { pharmacie: { id: string } }) => e.pharmacie.id === P.PN);
    expect(pn.pharmaciesProches[0].id).toBe(P.PV);
    expect((await api().get(`${ADMIN}/demandes-position?gouvernorat=61`).set('Cookie', admin.cookie).expect(200)).body.total).toBe(0);
  });

  test('pharmacie publiée : la position publique ne change pas tant qu\'une demande est en attente ou refusée', async () => {
    const d = await ecrire(S.C, api().post(`${PH}/pharmacies/${P.PP}/position`)).send({ latitude: 36.7712, longitude: 10.1534 }).expect(201);
    const publique = async () => (await api().get(`/api/v1/pharmacies/${P.PP}`).expect(200)).body;
    expect(await publique()).toMatchObject({ latitude: 36.77, longitude: 10.15 });
    await ecrire(admin, api().post(`${ADMIN}/demandes-position/${d.body.demande.id}/refuser`)).send({}).expect(400);
    const refus = await ecrire(admin, api().post(`${ADMIN}/demandes-position/${d.body.demande.id}/refuser`))
      .send({ motif: 'Position dans la mer' }).expect(200);
    expect(refus.body).toMatchObject({ etat: 'refusee', motifRefus: 'Position dans la mer' });
    expect(await publique()).toMatchObject({ latitude: 36.77, longitude: 10.15 });
    const etat = await api().get(`${PH}/pharmacies/${P.PP}/position`).set('Cookie', S.C.cookie).expect(200);
    expect(etat.body.demande).toMatchObject({ etat: 'refusee', motifRefus: 'Position dans la mer' });
    await ecrire(admin, api().post(`${ADMIN}/demandes-position/${d.body.demande.id}/refuser`)).send({ motif: 'Encore' }).expect(409);
    await ecrire(admin, api().post(`${ADMIN}/demandes-position/${d.body.demande.id}/valider`)).expect(409);
    expect((await journal(ctx, d.body.demande.id)).map((j) => j.action)).toEqual(['refuser_position', 'proposer_position']);

    // Nouvelle demande validée : la fiche publiée change de position et reste publiée.
    const d2 = await ecrire(S.C, api().post(`${PH}/pharmacies/${P.PP}/position`)).send({ latitude: 36.7712, longitude: 10.1534 }).expect(201);
    const v = await ecrire(admin, api().post(`${ADMIN}/demandes-position/${d2.body.demande.id}/valider`)).expect(200);
    expect(v.body).toMatchObject({ statutPublication: 'publiee', position: { latitude: 36.7712, longitude: 10.1534, confirmee: true } });
    expect(await publique()).toMatchObject({ latitude: 36.7712, longitude: 10.1534 });
  });

  test('validation : position confirmée, source pharmacien, étape suivante, historique et journal ; une seule fois', async () => {
    const [d] = await ctx.base.requete<{ uuid: string; id: string }>(
      `SELECT uuid, id FROM prive.demande_position WHERE pharmacie_id = $1 AND statut = 'en_attente'`, [ID.PA]);
    const r = await ecrire(admin, api().post(`${ADMIN}/demandes-position/${d.uuid}/valider`)).expect(200);
    expect(r.body).toMatchObject({ id: P.PA, statutPublication: 'pret-a-publier', motifsBlocage: [],
      position: { latitude: 36.812346, longitude: 10.198765, confirmee: true } });
    expect(await fiche('PA')).toMatchObject({ confirmee: true, source: 'saisie_pharmacien', statut: 'pret_a_publier' });
    const [h] = await ctx.base.requete<{ demande_position_id: string; acteur_id: string; motif: string }>(
      `SELECT demande_position_id, acteur_id, motif FROM annuaire.historique_position WHERE pharmacie_id = $1 ORDER BY id DESC LIMIT 1`, [ID.PA]);
    expect(h).toMatchObject({ demande_position_id: d.id, acteur_id: idAdmin });
    const [j] = await journal(ctx, d.uuid);
    expect(j).toMatchObject({ action: 'valider_position', acteur_id: idAdmin, detail: {
      pharmacie: P.PA, ancienne: null, nouvelle: { latitude: 36.812346, longitude: 10.198765, confirmee: true },
      statutAvant: 'en_attente_position', statutApres: 'pret_a_publier' } });
    const deux = await ecrire(admin, api().post(`${ADMIN}/demandes-position/${d.uuid}/valider`)).expect(409);
    expect(deux.body).toEqual({ erreur: 'deja-decidee', etat: 'validee' });
  });

  test('nom à relire : la validation mène à « a_relire », pas plus loin', async () => {
    const [d] = await ctx.base.requete<{ uuid: string }>(
      `SELECT uuid FROM prive.demande_position WHERE pharmacie_id = $1 AND statut = 'en_attente'`, [ID.PN]);
    const r = await ecrire(admin, api().post(`${ADMIN}/demandes-position/${d.uuid}/valider`)).expect(200);
    expect(r.body).toMatchObject({ statutPublication: 'a-relire', motifsBlocage: ['nom-non-relu'] });
  });
});

// ============================================================ priorité 4 : publication
describe('Cycle de publication', () => {
  test('circuit complet : la pharmacie validée est publiée et apparaît dans la liste, les proches et la carte', async () => {
    const absente = async () => JSON.stringify([
      (await api().get('/api/v1/pharmacies').query({ nom: 'Pharmacie Circuit' })).body,
      (await api().get('/api/v1/pharmacies/proches').query({ lat: 36.8123, lng: 10.1987, rayon_km: 1 })).body,
      (await api().get('/api/v1/pharmacies/carte').query({ sud: 36.8, ouest: 10.18, nord: 36.82, est: 10.21, zoom: 15 })).body,
    ]);
    expect(await absente()).not.toContain(P.PA);
    const r = await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.PA}/statut`)).send({ statut: 'publiee', motif: 'Fiche vérifiée' }).expect(200);
    expect(r.body.statutPublication).toBe('publiee');
    const liste = await api().get('/api/v1/pharmacies').query({ nom: 'Pharmacie Circuit' }).expect(200);
    expect(liste.body.elements.map((e: { id: string }) => e.id)).toEqual([P.PA]);
    const proches = await api().get('/api/v1/pharmacies/proches').query({ lat: 36.8123, lng: 10.1987, rayon_km: 1 }).expect(200);
    expect(proches.body.elements[0]).toMatchObject({ id: P.PA, latitude: 36.812346, longitude: 10.198765 });
    const carte = await api().get('/api/v1/pharmacies/carte').query({ sud: 36.8, ouest: 10.18, nord: 36.82, est: 10.21, zoom: 15 }).expect(200);
    expect(carte.body.points.map((p: { id: string }) => p.id)).toContain(P.PA);
    expect((await journal(ctx, P.PA)).find((j) => j.action === 'changer_statut')!.detail)
      .toEqual({ de: 'pret-a-publier', vers: 'publiee', motif: 'Fiche vérifiée' });
  });

  test('transitions interdites : 409 avec les transitions autorisées ; même statut : 409', async () => {
    const r = await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.PB}/statut`)).send({ statut: 'publiee' }).expect(409);
    expect(r.body).toEqual({ erreur: 'transition-interdite', de: 'en-attente-position', vers: 'publiee',
      autorisees: ['a-relire', 'pret-a-publier', 'non-publiable', 'fermee'] });
    expect((await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.PA}/statut`)).send({ statut: 'fusionnee' }).expect(409)).body.erreur)
      .toBe('transition-interdite');
    expect((await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.PA}/statut`)).send({ statut: 'publiee' }).expect(409)).body.erreur)
      .toBe('meme-statut');
    await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.PA}/statut`)).send({ statut: 'en-rupture' }).expect(400);
  });

  test('impossible de publier sans position confirmée ou sans nom relu : API (409) et SQL direct', async () => {
    const sansPosition = await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.PB}/statut`)).send({ statut: 'pret-a-publier' }).expect(409);
    expect(sansPosition.body).toEqual({ erreur: 'conditions-non-remplies', motifs: ['position-manquante'] });
    const nom = await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.PR}/statut`)).send({ statut: 'pret-a-publier' }).expect(409);
    expect(nom.body).toEqual({ erreur: 'conditions-non-remplies', motifs: ['nom-non-relu'] });
    // SQL direct, même au nom d'un administrateur : la contrainte de la base refuse.
    await expect(commeActeur(ctx, idAdmin, (tx) => tx.requete(`UPDATE annuaire.pharmacie SET statut_publication = 'pret_a_publier' WHERE id = $1`, [ID.PB])))
      .rejects.toMatchObject(CONTRAINTE);
    await expect(commeActeur(ctx, idAdmin, (tx) => tx.requete(`UPDATE annuaire.pharmacie SET statut_publication = 'pret_a_publier' WHERE id = $1`, [ID.PR])))
      .rejects.toMatchObject(CONTRAINTE);
    // Transition interdite (en_attente_position → publiee) en SQL direct, au nom d'un administrateur : refusée.
    await expect(commeActeur(ctx, idAdmin, (tx) => tx.requete(`UPDATE annuaire.pharmacie SET statut_publication = 'publiee' WHERE id = $1`, [ID.PB])))
      .rejects.toMatchObject(CONTRAINTE);
    expect(await fiche('PB')).toMatchObject({ statut: 'en_attente_position' });
  });

  test('relecture du nom, puis publication ; liste admin avec les motifs de blocage', async () => {
    const liste = await api().get(`${ADMIN}/pharmacies?statut=a-relire`).set('Cookie', admin.cookie).expect(200);
    expect(liste.body.elements.find((e: { id: string }) => e.id === P.PR)).toMatchObject({ motifsBlocage: ['nom-non-relu'], nomARelire: true });
    const r = await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.PR}/relire`)).expect(200);
    expect(r.body).toMatchObject({ nomARelire: false, motifsBlocage: [], statutPublication: 'a-relire' });
    expect((await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.PR}/relire`)).expect(409)).body.erreur).toBe('deja-relu');
    await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.PR}/statut`)).send({ statut: 'pret-a-publier' }).expect(200);
    await ecrire(admin, api().post(`${ADMIN}/pharmacies/${P.PR}/statut`)).send({ statut: 'publiee' }).expect(200);
    const attente = await api().get(`${ADMIN}/pharmacies?statut=en-attente-position&ville=TUNIS&gouvernorat=11`).set('Cookie', admin.cookie).expect(200);
    const pb = attente.body.elements.find((e: { id: string }) => e.id === P.PB);
    expect(pb).toMatchObject({ motifsBlocage: ['position-manquante'], demandePositionEnAttente: false });
    await api().get(`${ADMIN}/pharmacies?statut=inconnu`).set('Cookie', admin.cookie).expect(400);
  });

  test('le journal reçoit une ligne par décision', async () => {
    const lignes = await ctx.base.requete<{ action: string; n: number }>(
      `SELECT action, count(*)::int AS n FROM prive.journal_audit WHERE acteur_id = $1 AND action IN
        ('valider_position', 'refuser_position', 'relire_nom', 'changer_statut') GROUP BY action ORDER BY action`, [idAdmin]);
    expect(lignes).toEqual([
      { action: 'changer_statut', n: 3 }, { action: 'refuser_position', n: 1 }, { action: 'relire_nom', n: 1 }, { action: 'valider_position', n: 3 },
    ]);
  });

  test('le pharmacien ne change jamais le statut de publication', async () => {
    await ecrire(S.A, api().patch(`${PH}/pharmacies/${P.PA}`)).send({ statutPublication: 'fermee' }).expect(400);
    await expect(commeActeur(ctx, U.A, (tx) => tx.requete(`UPDATE annuaire.pharmacie SET statut_publication = 'fermee' WHERE id = $1`, [ID.PA])))
      .rejects.toMatchObject(REFUS);
    expect(await fiche('PA')).toMatchObject({ statut: 'publiee' });
  });
});

describe('Limitation de débit de l\'administration', () => {
  test('300 requêtes par minute et par compte (ici 3)', async () => {
    const autre = await demarrer({ limites: { ...lireConfiguration().limites, adminParCompte: { max: 3, fenetreMs: 60_000 } } });
    try {
      for (let i = 0; i < 3; i++) await request(autre.http).get(`${ADMIN}/pharmacies`).set('Cookie', admin.cookie).expect(200);
      expect((await request(autre.http).get(`${ADMIN}/pharmacies`).set('Cookie', admin.cookie).expect(429)).body.erreur).toBe('trop-de-tentatives');
    } finally {
      await autre.app.close();
    }
  });
});
