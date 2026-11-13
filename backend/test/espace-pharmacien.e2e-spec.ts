import request from 'supertest';
import { lireConfiguration } from '../src/config/configuration.js';
import { administrateur, commeActeur, compteVerifie, connecter, demarrer, fixtures, journal, type Contexte, type Session } from './aide.js';

/**
 * Espace pharmacien (Partie 7), sur mawjoud_test.
 * A : pharmacien de PA (non publiée : pret_a_publier) ; B : pharmacien de PB ; C : demande non validée ;
 * S : pharmacien validé puis suspendu. 103 médicaments créés ici.
 */
let ctx: Contexte;
const api = () => request(ctx.http);
const BASE = '/api/v1/pharmacien';

let admin: Session;
let A: Session; let B: Session; let C: Session; let S: Session;
let idA: string;
let PA: string; let PB: string; let PS: string;
let meds: string[] = [];

const ecrire = (s: Session, r: request.Test) => r.set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf);
const lire = (s: Session, chemin: string) => api().get(chemin).set('Cookie', s.cookie);

async function pharmacie(nom: string): Promise<string> {
  const [p] = await fixtures(ctx, (tx) => tx.requete<{ uuid: string }>(
    `INSERT INTO annuaire.pharmacie (nom, ville, gouvernorat_code, latitude, longitude, position_confirmee, source_gps, statut_publication, telephone_principal)
     VALUES ($1, 'Tunis', 11, 36.81, 10.17, true, 'tunidoc', 'pret_a_publier', '+21671111111') RETURNING uuid`, [nom]));
  return p.uuid;
}

async function pharmacienRattache(pharmacieUuid: string, valider = true): Promise<Session> {
  const email = await compteVerifie(ctx, 'pharmaciens');
  const s = await connecter(ctx, email);
  const d = await ecrire(s, api().post('/api/pharmacien/rattachement')).send({ pharmacieId: pharmacieUuid }).expect(201);
  if (valider) await ecrire(admin, api().post(`/api/admin/rattachements/${d.body.id}/valider`)).expect(200);
  return connecter(ctx, email);
}

async function idCompte(s: Session): Promise<string> {
  return (await ctx.base.requete<{ id: string }>(`SELECT id FROM prive.utilisateur WHERE uuid = $1`, [s.utilisateur.id as string]))[0].id;
}

async function nbHistorique(pharmacieUuid: string): Promise<number> {
  return (await ctx.base.requete<{ n: number }>(
    `SELECT count(*)::int AS n FROM annuaire.historique_stock h JOIN annuaire.pharmacie p ON p.id = h.pharmacie_id WHERE p.uuid = $1`, [pharmacieUuid]))[0].n;
}

beforeAll(async () => {
  ctx = await demarrer();
  admin = await connecter(ctx, await administrateur(ctx));
  PA = await pharmacie('Pharmacie Espace A');
  PB = await pharmacie('Pharmacie Espace B');
  PS = await pharmacie('Pharmacie Espace S');
  A = await pharmacienRattache(PA);
  B = await pharmacienRattache(PB);
  C = await pharmacienRattache(await pharmacie('Pharmacie Espace C'), false);
  S = await pharmacienRattache(PS);
  idA = await idCompte(A);
  await ctx.base.requete(`UPDATE prive.utilisateur SET suspendu = true WHERE id = $1`, [await idCompte(S)]);
  meds = (await ctx.base.requete<{ uuid: string }>(
    `INSERT INTO annuaire.medicament (code_source, nom_commercial, dci, dosage, donnee_test)
     SELECT 'EP' || lpad(i::text, 3, '0'), 'Espacemed ' || lpad(i::text, 3, '0'), CASE WHEN i % 2 = 0 THEN 'ibuprofène' ELSE 'métformine' END, '100 mg', true
       FROM generate_series(1, 103) i ORDER BY i RETURNING uuid`)).map((m) => m.uuid);
});
afterAll(async () => { await ctx.comptes.travauxTermines(); await ctx.app.close(); });

describe('Accès', () => {
  test('sans session : 401 ; patient : 403 ; écriture sans jeton CSRF : 403', async () => {
    await api().get(`${BASE}/pharmacies`).expect(401);
    const patient = await connecter(ctx, await compteVerifie(ctx));
    await lire(patient, `${BASE}/pharmacies`).expect(403);
    const r = await api().put(`${BASE}/pharmacies/${PA}/disponibilites/${meds[0]}`).set('Cookie', A.cookie).send({ statut: 'disponible' }).expect(403);
    expect(r.body).toEqual({ erreur: 'csrf' });
    await api().put(`${BASE}/pharmacies/${PA}/disponibilites/${meds[0]}`).send({ statut: 'disponible' }).expect(401);
  });

  test('mes pharmacies : la mienne seulement, avec son statut de publication', async () => {
    const r = await lire(A, `${BASE}/pharmacies`).expect(200);
    expect(r.body.elements).toEqual([{ id: PA, nom: 'Pharmacie Espace A', statutPublication: 'pret-a-publier', medicamentsDeclares: 0 }]);
  });

  test('compte non validé : aucune pharmacie, rien à déclarer ; compte suspendu : refusé partout', async () => {
    expect((await lire(C, `${BASE}/pharmacies`).expect(200)).body.elements).toEqual([]);
    await ecrire(C, api().put(`${BASE}/pharmacies/${PA}/disponibilites/${meds[0]}`)).send({ statut: 'disponible' }).expect(404);
    expect((await lire(S, `${BASE}/pharmacies`).expect(403)).body).toEqual({ erreur: 'compte-suspendu' });
    await ecrire(S, api().put(`${BASE}/pharmacies/${PS}/disponibilites/${meds[0]}`)).send({ statut: 'disponible' }).expect(403);
    await ecrire(S, api().patch(`${BASE}/pharmacies/${PS}`)).send({ garde: 'nuit' }).expect(403);
  });
});

describe('R9 : rien sur la pharmacie d\'un autre', () => {
  test('lecture, écriture, lot, retrait, historique, fiche : 404 identique à « inexistante », tentative journalisée', async () => {
    await ecrire(B, api().put(`${BASE}/pharmacies/${PB}/disponibilites/${meds[1]}`)).send({ statut: 'disponible' }).expect(200);
    const avantB = await nbHistorique(PB);

    const essais = [
      lire(A, `${BASE}/pharmacies/${PB}/disponibilites`),
      ecrire(A, api().put(`${BASE}/pharmacies/${PB}/disponibilites/${meds[1]}`)).send({ statut: 'en-rupture' }),
      ecrire(A, api().post(`${BASE}/pharmacies/${PB}/disponibilites/lot`)).send({ declarations: [{ medicamentId: meds[1], statut: 'en-rupture' }] }),
      ecrire(A, api().delete(`${BASE}/pharmacies/${PB}/disponibilites/${meds[1]}`)),
      lire(A, `${BASE}/pharmacies/${PB}/historique`),
      ecrire(A, api().patch(`${BASE}/pharmacies/${PB}`)).send({ telephone: '+21679999999' }),
    ];
    for (const e of essais) expect((await e.expect(404)).body).toEqual({ erreur: 'introuvable' });
    const inexistante = await lire(A, `${BASE}/pharmacies/00000000-0000-4000-8000-000000000000/disponibilites`).expect(404);
    expect(inexistante.body).toEqual({ erreur: 'introuvable' });

    // Rien n'a changé chez B.
    expect(await nbHistorique(PB)).toBe(avantB);
    const dispoB = await lire(B, `${BASE}/pharmacies/${PB}/disponibilites`).expect(200);
    expect(dispoB.body.elements.map((e: { statut: string }) => e.statut)).toEqual(['disponible']);
    const [{ telephone_principal }] = await ctx.base.requete<{ telephone_principal: string }>(
      `SELECT telephone_principal FROM annuaire.pharmacie WHERE uuid = $1`, [PB]);
    expect(telephone_principal).toBe('+21671111111');

    const traces = (await journal(ctx, PB)).filter((j) => j.action === 'acces_refuse' && j.acteur_id === idA);
    expect(traces.map((j) => j.detail.operation).sort()).toEqual(
      ['declarer', 'declarer_lot', 'lire_disponibilites', 'lire_historique', 'modifier_fiche', 'retirer'].sort());
  });

  test('la base refuse aussi : déclaration au nom d\'un autre, retrait sans acteur ou par un autre pharmacien', async () => {
    const [ids] = await ctx.base.requete<{ pa: string; m: string }>(
      `SELECT (SELECT id FROM annuaire.pharmacie WHERE uuid = $1) AS pa, (SELECT id FROM annuaire.medicament WHERE uuid = $2) AS m`, [PB, meds[1]]);
    await expect(ctx.base.requete(
      `UPDATE annuaire.stock SET statut = 'en_rupture', declare_le = now(), declare_par = $3 WHERE pharmacie_id = $1 AND medicament_id = $2`,
      [ids.pa, ids.m, idA])).rejects.toMatchObject({ code: '42501' });
    await expect(ctx.base.requete(`DELETE FROM annuaire.stock WHERE pharmacie_id = $1`, [ids.pa])).rejects.toMatchObject({ code: '42501' });
    await expect(ctx.base.transaction(async (tx) => {
      await tx.requete(`SELECT set_config('mawjoud.acteur_id', $1, true)`, [idA]);
      await tx.requete(`DELETE FROM annuaire.stock WHERE pharmacie_id = $1`, [ids.pa]);
    })).rejects.toMatchObject({ code: '42501' });
  });
});

describe('Déclarations', () => {
  test('date de déclaration fixée par le serveur ; une date envoyée par le client est refusée et rien n\'est écrit', async () => {
    const avant = await nbHistorique(PA);
    const refus = await ecrire(A, api().put(`${BASE}/pharmacies/${PA}/disponibilites/${meds[0]}`))
      .send({ statut: 'disponible', declareLe: '2020-01-01T00:00:00Z' }).expect(400);
    expect(refus.body).toEqual({ erreur: 'donnees-invalides', champs: ['declareLe'] });
    expect(await nbHistorique(PA)).toBe(avant);

    const t0 = Date.now();
    const r = await ecrire(A, api().put(`${BASE}/pharmacies/${PA}/disponibilites/${meds[0]}`)).send({ statut: 'quantite-limitee' }).expect(200);
    expect(r.body).toMatchObject({ medicament: { id: meds[0], nomCommercial: 'Espacemed 001' }, statut: 'quantite-limitee' });
    expect(Math.abs(new Date(r.body.declareLe).getTime() - t0)).toBeLessThan(5_000);
    const [{ ecart }] = await ctx.base.requete<{ ecart: number }>(
      `SELECT abs(extract(epoch FROM now() - s.declare_le)) AS ecart FROM annuaire.stock s
         JOIN annuaire.pharmacie p ON p.id = s.pharmacie_id JOIN annuaire.medicament m ON m.id = s.medicament_id
        WHERE p.uuid = $1 AND m.uuid = $2`, [PA, meds[0]]);
    expect(Number(ecart)).toBeLessThan(5);
    expect(await nbHistorique(PA)).toBe(avant + 1);
  });

  test('chaque déclaration ajoute une ligne à l\'historique ; l\'historique ne se modifie pas', async () => {
    const avant = await nbHistorique(PA);
    for (const statut of ['disponible', 'en-rupture', 'disponible']) {
      await ecrire(A, api().put(`${BASE}/pharmacies/${PA}/disponibilites/${meds[2]}`)).send({ statut }).expect(200);
    }
    expect(await nbHistorique(PA)).toBe(avant + 3);
    const h = await lire(A, `${BASE}/pharmacies/${PA}/historique?taille=3`).expect(200);
    expect(h.body.elements.map((e: { statut: string }) => e.statut)).toEqual(['disponible', 'en-rupture', 'disponible']);
    expect(h.body.total).toBe(avant + 3);
    await expect(ctx.base.requete(`UPDATE annuaire.historique_stock SET statut = 'disponible'`)).rejects.toMatchObject({ code: '42501' });
    await expect(ctx.base.requete(`DELETE FROM annuaire.historique_stock`)).rejects.toMatchObject({ code: '42501' });
  });

  test('statut ou médicament invalide', async () => {
    await ecrire(A, api().put(`${BASE}/pharmacies/${PA}/disponibilites/${meds[0]}`)).send({ statut: 'a-confirmer' }).expect(400);
    await ecrire(A, api().put(`${BASE}/pharmacies/${PA}/disponibilites/${meds[0]}`)).send({ statut: 'quantite_limitee' }).expect(400);
    await ecrire(A, api().put(`${BASE}/pharmacies/${PA}/disponibilites/00000000-0000-4000-8000-000000000000`)).send({ statut: 'disponible' }).expect(404);
    await ecrire(A, api().put(`${BASE}/pharmacies/${PA}/disponibilites/pas-un-uuid`)).send({ statut: 'disponible' }).expect(400);
  });

  test('liste paginée et recherche par nom ou DCI (accents ignorés)', async () => {
    const r = await lire(A, `${BASE}/pharmacies/${PA}/disponibilites?q=ESPACEMED%20003`).expect(200);
    expect(r.body.elements.map((e: { medicament: { id: string } }) => e.medicament.id)).toEqual([meds[2]]);
    const dci = await lire(A, `${BASE}/pharmacies/${PA}/disponibilites?q=metformine`).expect(200);
    // Espacemed 001 et 003 (déclarés plus haut) ont la DCI « métformine », recherchée ici sans accent.
    expect(dci.body.elements.map((e: { medicament: { dci: string } }) => e.medicament.dci)).toEqual(['métformine', 'métformine']);
    expect(dci.body.total).toBe(2);
    await lire(A, `${BASE}/pharmacies/${PA}/disponibilites?taille=51`).expect(400);
  });
});

describe('Mise à jour groupée', () => {
  test('100 lignes acceptées en une fois ; chacune ajoute une ligne à l\'historique', async () => {
    const avant = await nbHistorique(PA);
    const declarations = meds.slice(0, 100).map((medicamentId, i) => ({ medicamentId, statut: i % 3 === 0 ? 'en-rupture' : 'disponible' }));
    const r = await ecrire(A, api().post(`${BASE}/pharmacies/${PA}/disponibilites/lot`)).send({ declarations }).expect(200);
    expect(r.body.declarees).toBe(100);
    expect(await nbHistorique(PA)).toBe(avant + 100);
  });

  test('101 lignes : refusé', async () => {
    const declarations = meds.slice(0, 101).map((medicamentId) => ({ medicamentId, statut: 'disponible' }));
    const r = await ecrire(A, api().post(`${BASE}/pharmacies/${PA}/disponibilites/lot`)).send({ declarations }).expect(400);
    expect(r.body).toEqual({ erreur: 'donnees-invalides', champs: ['declarations'] });
  });

  test('tout ou rien : une ligne invalide annule tout, avec un rapport par ligne', async () => {
    const avant = await nbHistorique(PA);
    const statutAvant = (await lire(A, `${BASE}/pharmacies/${PA}/disponibilites?q=Espacemed%20101`).expect(200)).body.elements;
    const r = await ecrire(A, api().post(`${BASE}/pharmacies/${PA}/disponibilites/lot`)).send({ declarations: [
      { medicamentId: meds[100], statut: 'disponible' },
      { medicamentId: '00000000-0000-4000-8000-000000000000', statut: 'disponible' },
      { medicamentId: meds[101], statut: 'disponible' },
      { medicamentId: meds[100], statut: 'en-rupture' },
    ] }).expect(400);
    expect(r.body).toEqual({ erreur: 'lot-invalide', lignes: [
      { index: 1, medicamentId: '00000000-0000-4000-8000-000000000000', erreur: 'medicament-inconnu' },
      { index: 3, medicamentId: meds[100], erreur: 'doublon' },
    ] });
    const format = await ecrire(A, api().post(`${BASE}/pharmacies/${PA}/disponibilites/lot`)).send({ declarations: [
      { medicamentId: meds[100], statut: 'disponible' }, { medicamentId: meds[101], statut: 'rupture' },
    ] }).expect(400);
    expect(format.body).toEqual({ erreur: 'donnees-invalides', champs: ['declarations.1.statut'] });
    expect(await nbHistorique(PA)).toBe(avant);
    expect((await lire(A, `${BASE}/pharmacies/${PA}/disponibilites?q=Espacemed%20101`).expect(200)).body.elements).toEqual(statutAvant);
  });
});

describe('Retrait d\'une déclaration', () => {
  test('le médicament n\'est plus listé, l\'historique est conservé, le retrait est journalisé', async () => {
    await ecrire(A, api().put(`${BASE}/pharmacies/${PA}/disponibilites/${meds[102]}`)).send({ statut: 'disponible' }).expect(200);
    const avant = await nbHistorique(PA);
    await ecrire(A, api().delete(`${BASE}/pharmacies/${PA}/disponibilites/${meds[102]}`)).expect(204);
    expect((await lire(A, `${BASE}/pharmacies/${PA}/disponibilites?q=Espacemed%20103`).expect(200)).body.elements).toEqual([]);
    expect(await nbHistorique(PA)).toBe(avant);
    expect((await journal(ctx, PA))[0]).toMatchObject({ action: 'retirer_declaration', acteur_id: idA, detail: { medicament: meds[102], ancienStatut: 'disponible' } });
    await ecrire(A, api().delete(`${BASE}/pharmacies/${PA}/disponibilites/${meds[102]}`)).expect(404);
  });
});

describe('Fiche de la pharmacie (PATCH)', () => {
  test('téléphones, garde et horaires modifiés ; chaque champ journalisé avec ancienne et nouvelle valeur', async () => {
    const horaires = [{ jour: 1, ouverture: '08:00', fermeture: '13:00' }, { jour: 1, ouverture: '15:00', fermeture: '20:00' }, { jour: 6, ouverture: '20:00', fermeture: '08:00' }];
    const r = await ecrire(A, api().patch(`${BASE}/pharmacies/${PA}`))
      .send({ telephone: '+21671222333', telephonesAutres: ['+21698000000'], garde: 'nuit', horaires }).expect(200);
    expect(r.body).toMatchObject({ id: PA, telephone: '+21671222333', telephonesAutres: ['+21698000000'], garde: 'nuit', horaires, statutPublication: 'pret-a-publier' });
    const entrees = (await journal(ctx, PA)).filter((j) => j.action === 'modifier_fiche');
    expect(entrees.map((e) => e.detail.champ).sort()).toEqual(['garde', 'horaires', 'telephone', 'telephonesAutres']);
    expect(entrees.find((e) => e.detail.champ === 'telephone')!.detail).toEqual({ champ: 'telephone', ancien: '+21671111111', nouveau: '+21671222333' });
    expect(entrees.every((e) => e.acteur_id === idA)).toBe(true);
    // Effacer le téléphone : « Téléphone non renseigné ».
    expect((await ecrire(A, api().patch(`${BASE}/pharmacies/${PA}`)).send({ telephone: null }).expect(200)).body.telephone).toBeNull();
  });

  test.each([
    ['nom', 'Autre nom'], ['rue', '1 rue X'], ['adresse', 'X'], ['ville', 'Sfax'], ['gouvernorat', 61], ['gouvernorat_code', 61],
    ['latitude', 36.9], ['longitude', 10.2], ['statutPublication', 'publiee'], ['statut_publication', 'publiee'], ['declareLe', 'x'],
  ])('champ interdit « %s » : 400, rien n\'est changé', async (champ, valeur) => {
    const r = await ecrire(A, api().patch(`${BASE}/pharmacies/${PA}`)).send({ garde: 'jour', [champ]: valeur }).expect(400);
    expect(r.body).toEqual({ erreur: 'donnees-invalides', champs: [champ] });
    const [p] = await ctx.base.requete<{ nom: string; garde: string; statut: string; lat: number }>(
      `SELECT nom, garde, statut_publication AS statut, latitude AS lat FROM annuaire.pharmacie WHERE uuid = $1`, [PA]);
    expect(p).toEqual({ nom: 'Pharmacie Espace A', garde: 'nuit', statut: 'pret_a_publier', lat: 36.81 });
  });

  test('valeurs invalides : téléphone, plages en double ou identiques, trop de plages, corps vide', async () => {
    const patch = (corps: object) => ecrire(A, api().patch(`${BASE}/pharmacies/${PA}`)).send(corps);
    await patch({ telephone: '71 222 333' }).expect(400);
    await patch({ telephonesAutres: ['+2169800000'] }).expect(400);
    await patch({ garde: 'matin' }).expect(400);
    expect((await patch({ horaires: [{ jour: 1, ouverture: '08:00', fermeture: '08:00' }] }).expect(400)).body.champs).toEqual(['horaires.0']);
    expect((await patch({ horaires: [{ jour: 2, ouverture: '08:00', fermeture: '12:00' }, { jour: 2, ouverture: '08:00', fermeture: '13:00' }] }).expect(400)).body.champs).toEqual(['horaires.1']);
    await patch({ horaires: [{ jour: 7, ouverture: '08:00', fermeture: '12:00' }] }).expect(400);
    await patch({ horaires: [{ jour: 1, ouverture: '25:00', fermeture: '12:00' }] }).expect(400);
    await patch({ horaires: Array.from({ length: 22 }, (_, i) => ({ jour: i % 7, ouverture: `0${i % 10}:00`, fermeture: '23:00' })) }).expect(400);
    await patch({}).expect(400);
  });
});

describe('Publication', () => {
  test('pharmacie non publiée : déclarations invisibles partout ; une fois publiée, elles apparaissent', async () => {
    const med = meds[1]; // déclaré disponible par le lot
    const publics = async () => JSON.stringify([
      (await api().get('/api/v1/pharmacies').query({ taille: 50 })).body,
      (await api().get('/api/v1/pharmacies/proches').query({ lat: 36.81, lng: 10.17, rayon_km: 1 })).body,
      (await api().get('/api/v1/pharmacies/carte').query({ sud: 36.7, ouest: 10.0, nord: 36.9, est: 10.3, zoom: 12 })).body,
      (await api().get(`/api/v1/medicaments/${med}/pharmacies`)).body,
    ]);
    expect(await publics()).not.toContain(PA);
    await api().get(`/api/v1/pharmacies/${PA}`).expect(404);

    // Publication par un administrateur (jamais depuis l'espace pharmacien).
    const idAdmin = await idCompte(admin);
    await commeActeur(ctx, idAdmin, (tx) => tx.requete(`UPDATE annuaire.pharmacie SET statut_publication = 'publiee' WHERE uuid = $1`, [PA]));
    const r = await api().get(`/api/v1/medicaments/${med}/pharmacies`).expect(200);
    const ligne = r.body.elements.find((e: { pharmacie: { id: string } }) => e.pharmacie.id === PA);
    expect(ligne).toMatchObject({ statut: 'disponible', pharmacie: { nom: 'Pharmacie Espace A', etat: 'inscrite' } });
    expect((await api().get(`/api/v1/pharmacies/${PA}`).expect(200)).body.horaires).toHaveLength(3);
    await commeActeur(ctx, idAdmin, (tx) => tx.requete(`UPDATE annuaire.pharmacie SET statut_publication = 'pret_a_publier' WHERE uuid = $1`, [PA]));
  });
});

describe('Recherche de médicaments et limite par compte', () => {
  test('GET /medicaments : la même recherche que l\'API publique', async () => {
    const espace = await lire(A, `${BASE}/medicaments?q=Espacemed%20007`).expect(200);
    const publique = await api().get('/api/v1/medicaments?q=Espacemed%20007').expect(200);
    expect(espace.body).toEqual(publique.body);
    expect(espace.body.elements[0].nomCommercial).toBe('Espacemed 007');
  });

  test('120 requêtes par minute et par compte (ici 3) : un autre compte, même IP, n\'est pas bloqué', async () => {
    const autre = await demarrer({ limites: { ...lireConfiguration().limites, pharmacienParCompte: { max: 3, fenetreMs: 60_000 } } });
    try {
      for (let i = 0; i < 3; i++) await request(autre.http).get(`${BASE}/pharmacies`).set('Cookie', A.cookie).expect(200);
      const r = await request(autre.http).get(`${BASE}/pharmacies`).set('Cookie', A.cookie).expect(429);
      expect(r.body.erreur).toBe('trop-de-tentatives');
      await request(autre.http).get(`${BASE}/pharmacies`).set('Cookie', B.cookie).expect(200);
    } finally {
      await autre.app.close();
    }
  });
});
