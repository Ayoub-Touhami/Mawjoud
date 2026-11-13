import request from 'supertest';
import { BaseService } from '../src/base/base.service.js';
import { lireConfiguration } from '../src/config/configuration.js';
import { administrateur, compteVerifie, connecter, demarrer, type Contexte, type Session } from './aide.js';

/**
 * API publique (Partie 6) sur mawjoud_test. Jeu de données créé ici :
 * - publiées : P1 Tunis (nuit), P2 Tunis (Lac), P3 Ariana, P4 Sfax ;
 * - cachées, tout près du centre de recherche : en_attente_position (position non confirmée),
 *   a_relire, pret_a_publier ;
 * - disponibilités : M1 disponible en P1, limité en P2, disponible en P7 (cachée) ; M2 en rupture en P1 ;
 *   P3 publiée mais non inscrite (R7 : aucun stock visible).
 */
let ctx: Contexte;
const api = () => request(ctx.http);
const CENTRE = { lat: 36.8, lng: 10.18 };

interface Fiche { id: string; nom: string; latitude: number; longitude: number; distanceKm?: number; [cle: string]: unknown }
const P: Record<string, string> = {};   // uuid des pharmacies
const M: Record<string, string> = {};   // uuid des médicaments
const CACHEES = ['attente', 'relire', 'prete'];

async function creerPharmacie(cle: string, valeurs: {
  nom: string; ville: string; gouvernorat: number; lat: number | null; lng: number | null;
  statut: string; confirmee: boolean; garde?: string | null; telephone?: string | null; source?: string | null; nomAVerifier?: boolean;
}) {
  const [p] = await ctx.base.requete<{ uuid: string }>(
    `INSERT INTO annuaire.pharmacie (id_source, nom, ville, gouvernorat_code, latitude, longitude, position_confirmee,
                                     source_gps, precision_gps, statut_publication, garde, telephone_principal,
                                     telephones_autres, nom_a_verifier, sources)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'exact', $9, $10, $11, $12, $13, '{tunidoc}') RETURNING uuid`,
    [`C9${String(Object.keys(P).length).padStart(4, '0')}`, valeurs.nom, valeurs.ville, valeurs.gouvernorat, valeurs.lat, valeurs.lng,
     valeurs.confirmee, valeurs.lat === null ? null : (valeurs.source ?? 'tunidoc'), valeurs.statut, valeurs.garde ?? null,
     valeurs.telephone ?? null, valeurs.telephone ? ['+21671999999'] : [], valeurs.nomAVerifier ?? false],
  );
  P[cle] = p.uuid;
  return p.uuid;
}

/** Pharmacien vérifié, rattaché (validé) à la pharmacie : la pharmacie devient « inscrite ». */
async function inscrire(admin: Session, pharmacieUuid: string): Promise<string> {
  const email = await compteVerifie(ctx, 'pharmaciens');
  const s = await connecter(ctx, email);
  const d = await api().post('/api/pharmacien/rattachement').set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf)
    .send({ pharmacieId: pharmacieUuid }).expect(201);
  await api().post(`/api/admin/rattachements/${d.body.id}/valider`).set('Cookie', admin.cookie).set('X-XSRF-TOKEN', admin.csrf).expect(200);
  return (await ctx.base.requete<{ id: string }>(`SELECT id FROM prive.utilisateur WHERE email = $1`, [email]))[0].id;
}

async function declarer(pharmacieUuid: string, medicamentUuid: string, statut: string, declarant: string, ilYa = '1 hour') {
  await ctx.base.requete(
    `INSERT INTO annuaire.stock (pharmacie_id, medicament_id, statut, declare_le, declare_par)
     SELECT p.id, m.id, $3, now() - $5::interval, $4 FROM annuaire.pharmacie p, annuaire.medicament m WHERE p.uuid = $1 AND m.uuid = $2`,
    [pharmacieUuid, medicamentUuid, statut, declarant, ilYa]);
}

beforeAll(async () => {
  ctx = await demarrer();
  await creerPharmacie('p1', { nom: 'Pharmacie Ésperance Centre', ville: 'Tunis', gouvernorat: 11, ...{ lat: 36.8, lng: 10.18 }, statut: 'publiee', confirmee: true, garde: 'nuit', telephone: '+21671000001' });
  await creerPharmacie('p2', { nom: 'Pharmacie du Lac', ville: 'TUNIS', gouvernorat: 11, lat: 36.832, lng: 10.233, statut: 'publiee', confirmee: true, garde: 'jour' });
  await creerPharmacie('p3', { nom: 'Pharmacie El Manar', ville: 'Ariana', gouvernorat: 12, lat: 36.86, lng: 10.19, statut: 'publiee', confirmee: true, source: 'osm_telephone' });
  await creerPharmacie('p4', { nom: 'Pharmacie de Sfax', ville: 'Sfax', gouvernorat: 61, lat: 34.74, lng: 10.76, statut: 'publiee', confirmee: true });
  await creerPharmacie('attente', { nom: 'Pharmacie Cachée Attente', ville: 'Tunis', gouvernorat: 11, lat: 36.8001, lng: 10.1801, statut: 'en_attente_position', confirmee: false, source: 'osm_telephone' });
  await creerPharmacie('relire', { nom: 'Pharmacie Cachée Relire', ville: 'Tunis', gouvernorat: 11, lat: 36.8002, lng: 10.1802, statut: 'a_relire', confirmee: true, nomAVerifier: true });
  await creerPharmacie('prete', { nom: 'Pharmacie Cachée Prête', ville: 'Tunis', gouvernorat: 11, lat: 36.8003, lng: 10.1803, statut: 'pret_a_publier', confirmee: true });
  await ctx.base.requete(
    `INSERT INTO annuaire.horaire (pharmacie_id, jour, ouverture, fermeture)
     SELECT id, j, '08:00', '20:00' FROM annuaire.pharmacie, generate_series(1, 6) j WHERE uuid = $1`, [P.p1]);

  const meds = await ctx.base.requete<{ uuid: string; nom_commercial: string }>(
    `INSERT INTO annuaire.medicament (code_source, nom_commercial, dci, forme, dosage, donnee_test) VALUES
       ('E001', 'Doliprane Essai', 'paracétamol', 'comprimé', '500 mg', true),
       ('E002', 'Efferalgan Essai', 'paracétamol', 'comprimé', '1 g', true),
       ('E003', 'Amoxicilline Essai', 'amoxicilline', 'gélule', '500 mg', true),
       ('E004', 'Sirop 100% naturel', 'plantes', 'sirop', NULL, true)
     RETURNING uuid, nom_commercial`);
  for (const m of meds) M[m.nom_commercial] = m.uuid;

  const admin = await connecter(ctx, await administrateur(ctx));
  const ph1 = await inscrire(admin, P.p1);
  const ph2 = await inscrire(admin, P.p2);
  const ph7 = await inscrire(admin, P.prete);
  await declarer(P.p1, M['Doliprane Essai'], 'disponible', ph1, '3 hours');
  await declarer(P.p1, M['Efferalgan Essai'], 'en_rupture', ph1);
  await declarer(P.p2, M['Doliprane Essai'], 'quantite_limitee', ph2, '30 minutes');
  await declarer(P.prete, M['Doliprane Essai'], 'disponible', ph7);
  // Statistiques à jour après l'insertion (migration 030) : plans d'exécution stables.
  await ctx.base.requete(`SELECT annuaire.analyser_annuaire()`);
});
afterAll(async () => { await ctx.comptes.travauxTermines(); await ctx.app.close(); });

const noms = (elements: { nom?: string; pharmacie?: { nom: string } }[]) => elements.map((e) => e.nom ?? e.pharmacie?.nom);
const ids = (elements: Fiche[]) => elements.map((e) => e.id);

/** Champs autorisés : rien d'interne (statut de publication, source brute, identifiants techniques…). */
const CHAMPS_RESUME = ['etat', 'garde', 'gouvernorat', 'id', 'latitude', 'longitude', 'nom', 'quartier', 'rue', 'telephone', 'ville'];
const INTERDITS = /id_source|idSource|statut_publication|statutPublication|source_gps|sourceGps|code_source|codeSource|nom_a_verifier|a_verifier|aVerifier|pharmacien|declare_par|declarePar|"sources"|precision|C9000|@exemple/;

describe('Pharmacies non publiées : absentes partout', () => {
  test('liste, proches, carte, fiche, disponibilités', async () => {
    const liste = await api().get('/api/v1/pharmacies').query({ taille: 50 }).expect(200);
    const proches = await api().get('/api/v1/pharmacies/proches').query({ ...CENTRE, rayon_km: 50, limite: 50 }).expect(200);
    const carte = await api().get('/api/v1/pharmacies/carte').query({ sud: 36.7, ouest: 10.1, nord: 36.9, est: 10.3, zoom: 14 }).expect(200);
    const dispo = await api().get(`/api/v1/medicaments/${M['Doliprane Essai']}/pharmacies`).expect(200);
    const tout = JSON.stringify([liste.body, proches.body, carte.body, dispo.body]);
    for (const cle of CACHEES) {
      expect(tout).not.toContain(P[cle]);
      await api().get(`/api/v1/pharmacies/${P[cle]}`).expect(404);
    }
    expect(tout).not.toContain('Cachée');
    expect(liste.body.total).toBe(4);
    expect(new Set(noms(liste.body.elements))).toEqual(new Set(['Pharmacie Ésperance Centre', 'Pharmacie du Lac', 'Pharmacie El Manar', 'Pharmacie de Sfax']));
  });

  test('les coordonnées renvoyées sont toujours des positions confirmées', async () => {
    const liste = await api().get('/api/v1/pharmacies').query({ taille: 50 }).expect(200);
    const carte = await api().get('/api/v1/pharmacies/carte').query({ sud: 30, ouest: 7, nord: 38, est: 12, zoom: 6 }).expect(200);
    const renvoyes = [...liste.body.elements, ...carte.body.points] as Fiche[];
    expect(renvoyes.length).toBeGreaterThan(0);
    for (const p of renvoyes) {
      expect(typeof p.latitude).toBe('number');
      const [l] = await ctx.base.requete<{ confirmee: boolean; statut: string; lat: number }>(
        `SELECT position_confirmee AS confirmee, statut_publication AS statut, latitude AS lat FROM annuaire.pharmacie WHERE uuid = $1`, [p.id]);
      expect(l).toEqual({ confirmee: true, statut: 'publiee', lat: p.latitude });
    }
  });
});

describe('GET /v1/pharmacies', () => {
  test('champs publics seulement, pagination bornée', async () => {
    const r = await api().get('/api/v1/pharmacies').query({ taille: 2, page: 2 }).expect(200);
    expect(r.body).toMatchObject({ page: 2, taille: 2, total: 4 });
    expect(r.body.elements).toHaveLength(2);
    for (const e of r.body.elements) expect(Object.keys(e).sort()).toEqual(CHAMPS_RESUME);
    expect(JSON.stringify(r.body)).not.toMatch(INTERDITS);
    expect(r.headers['set-cookie']).toBeUndefined();
  });

  test('filtres : gouvernorat, ville et nom sans accents ni casse, garde', async () => {
    const g = await api().get('/api/v1/pharmacies').query({ gouvernorat: 12 }).expect(200);
    expect(noms(g.body.elements)).toEqual(['Pharmacie El Manar']);
    const v = await api().get('/api/v1/pharmacies').query({ ville: '  tunis ' }).expect(200);
    expect(new Set(noms(v.body.elements))).toEqual(new Set(['Pharmacie Ésperance Centre', 'Pharmacie du Lac']));
    for (const nom of ['esperance', 'ESPÉRANCE', 'éspér', 'ance cen']) {
      const n = await api().get('/api/v1/pharmacies').query({ nom }).expect(200);
      expect(noms(n.body.elements)).toEqual(['Pharmacie Ésperance Centre']);
    }
    const nuit = await api().get('/api/v1/pharmacies').query({ garde: 'true' }).expect(200);
    expect(noms(nuit.body.elements)).toEqual(['Pharmacie Ésperance Centre']);
    const autres = await api().get('/api/v1/pharmacies').query({ garde: 'false' }).expect(200);
    expect(autres.body.total).toBe(3);
  });

  test('% et _ saisis sont des caractères ordinaires (échappés)', async () => {
    const pourcent = await api().get('/api/v1/pharmacies').query({ nom: '%%' }).expect(200);
    expect(pourcent.body.total).toBe(0);
    const souligne = await api().get('/api/v1/pharmacies').query({ nom: 'du_lac' }).expect(200);
    expect(souligne.body.total).toBe(0);
    const injection = await api().get('/api/v1/pharmacies').query({ nom: "x' OR 1=1 --" }).expect(200);
    expect(injection.body.total).toBe(0);
  });

  test.each([
    [{ taille: 51 }, 'taille'], [{ page: 0 }, 'page'], [{ gouvernorat: 'abc' }, 'gouvernorat'], [{ gouvernorat: 99 }, 'gouvernorat'],
    [{ garde: 'oui' }, 'garde'], [{ nom: 'a' }, 'nom'], [{ inconnu: 1 }, 'inconnu'], [{ taille: '10; DROP TABLE x' }, 'taille'],
  ])('paramètre invalide %j → 400', async (params, champ) => {
    const r = await api().get('/api/v1/pharmacies').query(params).expect(400);
    expect(r.body).toEqual({ erreur: 'donnees-invalides', champs: [champ] });
  });
});

describe('GET /v1/pharmacies/proches', () => {
  /** Distance de référence calculée ici, indépendamment du SQL. */
  function haversine(a: { lat: number; lng: number }, b: { latitude: number; longitude: number }) {
    const r = (x: number) => (x * Math.PI) / 180;
    const h = Math.sin(r(b.latitude - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.latitude)) * Math.sin(r(b.longitude - a.lng) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  }

  test('rayon respecté, tri par distance croissante, distances exactes', async () => {
    const r5 = await api().get('/api/v1/pharmacies/proches').query(CENTRE).expect(200);
    expect(r5.body.rayonKm).toBe(5);
    expect(noms(r5.body.elements)).toEqual(['Pharmacie Ésperance Centre']);
    const r10 = await api().get('/api/v1/pharmacies/proches').query({ ...CENTRE, rayon_km: 10 }).expect(200);
    const el = r10.body.elements as Fiche[];
    expect(noms(el)).toEqual(['Pharmacie Ésperance Centre', 'Pharmacie du Lac', 'Pharmacie El Manar']);
    for (let i = 0; i < el.length; i++) {
      expect(el[i].distanceKm).toBeLessThanOrEqual(10);
      expect(el[i].distanceKm).toBeCloseTo(haversine(CENTRE, el[i]), 1);
      if (i > 0) expect(el[i].distanceKm!).toBeGreaterThanOrEqual(el[i - 1].distanceKm!);
    }
    const lac = el.find((e) => e.id === P.p2)!;
    expect(lac.distanceKm).toBeGreaterThan(5);
    const limite = await api().get('/api/v1/pharmacies/proches').query({ ...CENTRE, rayon_km: 10, limite: 1 }).expect(200);
    expect(ids(limite.body.elements)).toEqual([P.p1]);
  });

  test.each([
    [{ lat: 36.8 }, 'lng'], [{ ...CENTRE, rayon_km: 51 }, 'rayon_km'], [{ ...CENTRE, rayon_km: 0 }, 'rayon_km'],
    [{ lat: 40, lng: 10 }, 'lat'], [{ lat: 36.8, lng: 13 }, 'lng'], [{ lat: 'nord', lng: 10 }, 'lat'], [{ ...CENTRE, limite: 51 }, 'limite'],
  ])('paramètre invalide %j → 400', async (params, champ) => {
    const r = await api().get('/api/v1/pharmacies/proches').query(params).expect(400);
    expect(r.body.erreur).toBe('donnees-invalides');
    expect(r.body.champs).toContain(champ);
  });
});

describe('GET /v1/pharmacies/carte', () => {
  test('boîte englobante : points légers, seulement ceux de la boîte', async () => {
    const r = await api().get('/api/v1/pharmacies/carte').query({ sud: 36.7, ouest: 10.1, nord: 36.9, est: 10.3, zoom: 13 }).expect(200);
    expect(r.body).toMatchObject({ tronque: false, plafond: 500, zoom: 13 });
    expect(new Set(ids(r.body.points))).toEqual(new Set([P.p1, P.p2, P.p3]));
    for (const p of r.body.points) expect(Object.keys(p).sort()).toEqual(['garde', 'id', 'latitude', 'longitude', 'nom']);
  });

  test.each([
    [{ sud: 36.9, ouest: 10.1, nord: 36.7, est: 10.3, zoom: 10 }],
    [{ sud: 36.7, ouest: 10.3, nord: 36.9, est: 10.1, zoom: 10 }],
    [{ sud: 36.7, ouest: 10.1, nord: 36.9, est: 10.3, zoom: 23 }],
    [{ sud: 36.7, ouest: 10.1, nord: 36.9, est: 10.3 }],
  ])('boîte ou zoom invalide %j → 400', async (params) => {
    expect((await api().get('/api/v1/pharmacies/carte').query(params).expect(400)).body.erreur).toBe('donnees-invalides');
  });
});

describe('GET /v1/pharmacies/:id', () => {
  test('fiche publique complète, sans champ interne', async () => {
    const r = await api().get(`/api/v1/pharmacies/${P.p1}`).expect(200);
    expect(r.body).toMatchObject({
      id: P.p1, nom: 'Pharmacie Ésperance Centre', ville: 'Tunis', gouvernorat: { code: 11, nom: 'Tunis' },
      telephone: '+21671000001', telephonesAutres: ['+21671999999'], garde: 'nuit', latitude: 36.8, longitude: 10.18,
      etat: 'inscrite', sourceOpenStreetMap: false,
    });
    expect(r.body.horaires).toHaveLength(6);
    expect(r.body.horaires[0]).toEqual({ jour: 1, ouverture: '08:00', fermeture: '20:00' });
    expect(JSON.stringify(r.body)).not.toMatch(INTERDITS);
    expect((await api().get(`/api/v1/pharmacies/${P.p3}`).expect(200)).body).toMatchObject({ sourceOpenStreetMap: true, etat: 'non-inscrite' });
  });

  test('inconnue → 404 ; identifiant mal formé → 400', async () => {
    await api().get('/api/v1/pharmacies/00000000-0000-4000-8000-000000000000').expect(404);
    expect((await api().get('/api/v1/pharmacies/abc').expect(400)).body).toEqual({ erreur: 'donnees-invalides', champs: ['id'] });
  });
});

describe('GET /v1/medicaments', () => {
  test('nom commercial ou DCI, accents et casse ignorés, tri par pertinence', async () => {
    for (const q of ['PARACETAMOL', 'paracétamol', 'Paracétamol ']) {
      const r = await api().get('/api/v1/medicaments').query({ q }).expect(200);
      expect(new Set(r.body.elements.map((m: { nomCommercial: string }) => m.nomCommercial))).toEqual(new Set(['Doliprane Essai', 'Efferalgan Essai']));
    }
    const exact = await api().get('/api/v1/medicaments').query({ q: 'doliprane essai' }).expect(200);
    expect(exact.body.elements[0]).toMatchObject({ nomCommercial: 'Doliprane Essai', dci: 'paracétamol', dosage: '500 mg', donneeTest: true });
    expect(Object.keys(exact.body.elements[0]).sort()).toEqual(['categorie', 'dci', 'dciAr', 'donneeTest', 'dosage', 'forme', 'id', 'nomAr', 'nomCommercial']);
    const faute = await api().get('/api/v1/medicaments').query({ q: 'amoxiciline' }).expect(200);
    expect(faute.body.elements[0].nomCommercial).toBe('Amoxicilline Essai');
  });

  test('% échappé ; paramètres invalides', async () => {
    const r = await api().get('/api/v1/medicaments').query({ q: '0%' }).expect(200);
    expect(r.body.elements.map((m: { nomCommercial: string }) => m.nomCommercial)).toEqual(['Sirop 100% naturel']);
    expect((await api().get('/api/v1/medicaments').query({ q: '%%' }).expect(200)).body.elements).toEqual([]);
    await api().get('/api/v1/medicaments').query({ q: 'a' }).expect(400);
    await api().get('/api/v1/medicaments').expect(400);
    await api().get('/api/v1/medicaments').query({ q: 'para', limite: 51 }).expect(400);
  });
});

describe('GET /v1/medicaments/:id/pharmacies', () => {
  test('pharmacies publiées et inscrites seulement, statut et date de déclaration', async () => {
    const r = await api().get(`/api/v1/medicaments/${M['Doliprane Essai']}/pharmacies`).expect(200);
    expect(r.body.elements.map((e: { pharmacie: Fiche }) => e.pharmacie.id)).toEqual([P.p2, P.p1]); // plus récente d'abord
    expect(r.body.elements[0]).toMatchObject({ statut: 'quantite-limitee', declareLe: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) });
    expect(r.body.elements[1].statut).toBe('disponible');
    expect(r.headers['cache-control']).toBe('public, max-age=60');
    expect(JSON.stringify(r.body)).not.toMatch(INTERDITS);
  });

  test('tri par distance avec lat et lng ; en rupture seulement → vide ; erreurs', async () => {
    const r = await api().get(`/api/v1/medicaments/${M['Doliprane Essai']}/pharmacies`).query({ lat: 36.832, lng: 10.233 }).expect(200);
    expect(r.body.elements.map((e: { pharmacie: Fiche }) => e.pharmacie.id)).toEqual([P.p2, P.p1]);
    expect(r.body.elements[0].pharmacie.distanceKm).toBe(0);
    expect((await api().get(`/api/v1/medicaments/${M['Efferalgan Essai']}/pharmacies`).expect(200)).body.elements).toEqual([]);
    expect((await api().get(`/api/v1/medicaments/${M['Doliprane Essai']}/pharmacies`).query({ lat: 36.8 }).expect(400)).body.champs).toEqual(['lat', 'lng']);
    await api().get('/api/v1/medicaments/00000000-0000-4000-8000-000000000000/pharmacies').expect(404);
    await api().get('/api/v1/medicaments/pas-un-uuid/pharmacies').expect(400);
  });
});

describe('Référentiels', () => {
  test('gouvernorats et villes ayant une pharmacie publiée, cache 1 h, aucun cookie même avec une session', async () => {
    const s = await connecter(ctx, await compteVerifie(ctx));
    const g = await api().get('/api/v1/gouvernorats').set('Cookie', s.cookie).expect(200);
    expect(g.body.elements).toEqual([
      { code: 12, nom: 'Ariana', nombrePharmacies: 1 },
      { code: 61, nom: 'Sfax', nombrePharmacies: 1 },
      { code: 11, nom: 'Tunis', nombrePharmacies: 2 },
    ]);
    expect(g.headers['cache-control']).toBe('public, max-age=3600');
    expect(g.headers['set-cookie']).toBeUndefined();
    const v = await api().get('/api/v1/villes').query({ gouvernorat: 11 }).expect(200);
    // « Tunis » et « TUNIS » ne font qu'une ville (regroupées sans casse ni accents).
    expect(v.body.elements).toHaveLength(1);
    expect(v.body.elements[0]).toMatchObject({ gouvernorat: 11, nombrePharmacies: 2 });
    expect(v.body.elements[0].nom.toLowerCase()).toBe('tunis');
    const toutes = await api().get('/api/v1/villes').expect(200);
    expect(toutes.body.elements.map((x: { nom: string }) => x.nom.toLowerCase())).toEqual(['ariana', 'sfax', 'tunis']);
    await api().get('/api/v1/villes').query({ gouvernorat: 'x' }).expect(400);
  });
});

describe('Lecture seule et vues publiques seulement', () => {
  test('aucune route d\'écriture ; la base refuse toute écriture et toute table hors publique.*', async () => {
    await api().post('/api/v1/pharmacies').send({}).expect(404);
    await api().delete(`/api/v1/pharmacies/${P.p1}`).expect(404);
    const base = ctx.app.get(BaseService);
    const role = await base.lecturePublique((l) => l.requete<{ r: string; ro: string }>(`SELECT current_user AS r, current_setting('transaction_read_only') AS ro`));
    expect(role).toEqual([{ r: 'mawjoud_lecture_publique', ro: 'on' }]);
    await expect(base.lecturePublique((l) => l.requete(`SELECT count(*) FROM annuaire.pharmacie`))).rejects.toMatchObject({ code: '42501' });
    await expect(base.lecturePublique((l) => l.requete(`SELECT count(*) FROM prive.utilisateur`))).rejects.toMatchObject({ code: '42501' });
    // Deux protections indépendantes : aucun droit d'écriture (42501)…
    await expect(base.lecturePublique((l) => l.requete(`UPDATE annuaire.pharmacie SET nom = 'x' WHERE false`))).rejects.toMatchObject({ code: '42501' });
    await expect(base.lecturePublique((l) => l.requete(
      `INSERT INTO prive.journal_audit (action, cible_type, cible_id) VALUES ('valider', 'pharmacie', 'x')`))).rejects.toMatchObject({ code: '42501' });
    // … et transaction en lecture seule (25006), même pour ce que le rôle pourrait faire (table temporaire).
    await expect(base.lecturePublique((l) => l.requete(`CREATE TEMP TABLE t (x int)`))).rejects.toMatchObject({ code: '25006' });
    // Après une lecture publique, la connexion du pool a retrouvé le compte mawjoud_api.
    const [apres] = await base.requete<{ r: string }>(`SELECT current_user AS r`);
    expect(apres.r).toBe('mawjoud_api');
  });
});

describe('Limitation de débit des routes publiques', () => {
  test('au-delà du plafond par IP : 429 avec Retry-After', async () => {
    const autre = await demarrer({ limites: { ...lireConfiguration().limites, publicParIp: { max: 3, fenetreMs: 60_000 } } });
    try {
      for (let i = 0; i < 3; i++) await request(autre.http).get('/api/v1/gouvernorats').expect(200);
      const r = await request(autre.http).get('/api/v1/gouvernorats').expect(429);
      expect(r.body.erreur).toBe('trop-de-tentatives');
      expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    } finally {
      await autre.app.close();
    }
  });
});

describe('Plafond de la carte (en dernier : ajoute 520 pharmacies publiées à Gabès)', () => {
  test('plus de 500 points dans la boîte : 500 renvoyés, tronque = true', async () => {
    await ctx.base.requete(
      `INSERT INTO annuaire.pharmacie (nom, ville, gouvernorat_code, latitude, longitude, position_confirmee, source_gps, statut_publication)
       SELECT 'Pharmacie Gabès ' || i, 'Gabès', 81, 33.80 + (i % 26) * 0.005, 10.05 + (i / 26) * 0.005, true, 'tunidoc', 'publiee'
         FROM generate_series(1, 520) i`);
    await ctx.base.requete(`SELECT annuaire.analyser_annuaire()`);
    const r = await api().get('/api/v1/pharmacies/carte').query({ sud: 33.7, ouest: 9.9, nord: 34.0, est: 10.3, zoom: 11 }).expect(200);
    expect(r.body.points).toHaveLength(500);
    expect(r.body.tronque).toBe(true);
    const petite = await api().get('/api/v1/pharmacies/carte').query({ sud: 33.79, ouest: 10.04, nord: 33.806, est: 10.056, zoom: 16 }).expect(200);
    expect(petite.body.tronque).toBe(false);
    expect(petite.body.points.length).toBeGreaterThan(0);
  });

  // Statistiques à jour (annuaire.analyser_annuaire, migration 030, lancée après l'insertion) :
  // le choix de l'index est stable. L'ancien index GiST pharmacie_carte reste pour l'administration.
  test('la boîte englobante utilise l\'index pharmacie_publiee_position (029) à travers la vue publique', async () => {
    const plan = await ctx.base.lecturePublique(async (l) => {
      const lignes = await l.requete<{ 'QUERY PLAN': string }>(
        `EXPLAIN SELECT id FROM publique.pharmacie WHERE latitude BETWEEN 33.80 AND 33.81 AND longitude BETWEEN 10.05 AND 10.06`);
      return lignes.map((x) => x['QUERY PLAN']).join('\n');
    });
    expect(plan).not.toMatch(/Seq Scan on pharmacie/);
    expect(plan).toMatch(/Index Scan (on|using) pharmacie_publiee_position/);
  });

  test('analyser_annuaire : exécutable par l\'API, refusée au rôle de lecture publique', async () => {
    await expect(ctx.base.lecturePublique((l) => l.requete(`SELECT annuaire.analyser_annuaire()`))).rejects.toMatchObject({ code: '42501' });
  });
});
