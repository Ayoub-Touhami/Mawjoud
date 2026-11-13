import type { LoggerService } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AlertesService } from '../src/alertes/alertes.service.js';
import { creerApplication } from '../src/application.js';
import type { Configuration } from '../src/config/configuration.js';
import {
  administrateur, compteVerifie, connecter, cookies, demarrer, emailUnique, fixtures, MDP, type Contexte, type Session,
} from './aide.js';

/**
 * Partie 9d : erreurs et journaux.
 * 1. Entrées hostiles (injections, JSON énorme ou mal formé, caractères spéciaux, UUID invalides) : jamais de
 *    500, et aucune réponse ne révèle une trace, une requête SQL, un nom de table ou un chemin de fichier.
 * 2. Journaux : une application de développement (e-mails dans la console, tous les niveaux de journal) fait
 *    tout le parcours, entrées hostiles comprises ; le journal capturé ne contient ni adresse e-mail en clair,
 *    ni mot de passe, ni cookie, ni nom de médicament associé à un compte.
 */
let ctx: Contexte;
beforeAll(async () => { ctx = await demarrer(); });
afterAll(async () => { await ctx.comptes.travauxTermines(); await ctx.app.close(); });
const ecrire = (s: Session, r: request.Test) => r.set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf);

/** Ce qu'une réponse d'erreur ne doit jamais contenir. */
const FUITES = [
  /\bat [\w.<>]+ \(/, /stack/i, /\.ts\b/, /\.js\b/, /node_modules/, /[A-Z]:\\/, /\/src\//, /\/home\//,
  /\bSELECT\b/i, /\bINSERT\b/i, /\bUPDATE\b/i, /\bWHERE\b/i, /\bprive\./, /\bannuaire\./, /\bpublique\./, /\brelation\b/i,
  /syntax/i, /violates|viole/i, /constraint|contrainte/i, /duplicate|dupliqu/i, /postgres/i, /mawjoud_api/, /ERREUR|ERROR:/,
  /\bpg\b/, /TypeError|ReferenceError|SyntaxError/, /invalid input/i,
];

function sansFuite(r: request.Response, entree: string): void {
  if (r.status < 400 || r.status >= 500) throw new Error(`Statut ${r.status} pour ${entree} : ${r.text.slice(0, 120)}`);
  expect(typeof r.body.erreur).toBe('string');
  for (const f of FUITES) {
    if (f.test(r.text)) throw new Error(`Fuite possible (${f}) pour ${entree} : ${r.text.slice(0, 200)}`);
  }
}

const INJECTIONS = [
  "' OR '1'='1", "'; DROP TABLE prive.utilisateur; --", '" OR ""="', '%', '_', '\\', '$1', '1; SELECT pg_sleep(5)',
  '../../../../etc/passwd', '..\\..\\windows\\win.ini', '<script>alert(1)</script>', '{{7*7}}', '${7*7}',
  'a\u0000b', '‮عكس', '😀'.repeat(50), 'x'.repeat(5000), '￿￾', '\r\nSet-Cookie: x=1',
];
const UUID_INVALIDES = [
  'abc', '1', "1' OR '1'='1", '00000000-0000-0000-0000-00000000000Z', '00000000-0000-0000-0000-0000000000000',
  '%00', '..%2F..%2Fetc%2Fpasswd', 'x'.repeat(300), 'null', 'undefined', '-1',
];

describe('1. Entrées hostiles : jamais de 500, aucune fuite', () => {
  let patient: Session; let pharmacien: Session; let admin: Session;
  beforeAll(async () => {
    patient = await connecter(ctx, await compteVerifie(ctx));
    pharmacien = await connecter(ctx, await compteVerifie(ctx, 'pharmaciens'));
    admin = await connecter(ctx, await administrateur(ctx));
  });

  test('paramètres de recherche hostiles (routes publiques et d\'administration)', async () => {
    for (const x of INJECTIONS) {
      for (const [route, q] of [
        ['/api/v1/pharmacies', { nom: x }], ['/api/v1/pharmacies', { ville: x }], ['/api/v1/pharmacies', { gouvernorat: x }],
        ['/api/v1/pharmacies', { page: x }], ['/api/v1/medicaments', { q: x }], ['/api/v1/villes', { gouvernorat: x }],
        ['/api/v1/pharmacies/proches', { lat: x, lng: '10' }], ['/api/v1/pharmacies/carte', { sud: x, ouest: 1, nord: 2, est: 3, zoom: 4 }],
      ] as const) {
        const r = await request(ctx.http).get(route).query(q);
        if (r.status >= 400) sansFuite(r, `${route} ${JSON.stringify(q).slice(0, 60)}`);
        else expect(r.status).toBe(200);
      }
      for (const [route, q] of [
        ['/api/v1/admin/journal', { cibleId: x }], ['/api/v1/admin/comptes', { email: x }], ['/api/v1/admin/pharmacies', { ville: x }],
      ] as const) {
        const r = await request(ctx.http).get(route).query(q).set('Cookie', admin.cookie);
        if (r.status >= 400) sansFuite(r, `${route} ${JSON.stringify(q).slice(0, 60)}`);
        else expect(r.status).toBe(200);
      }
    }
  });

  test('identifiants invalides dans le chemin', async () => {
    for (const id of UUID_INVALIDES) {
      sansFuite(await request(ctx.http).get(`/api/v1/pharmacies/${id}`), `pharmacie ${id}`);
      sansFuite(await request(ctx.http).get(`/api/v1/medicaments/${id}/pharmacies`), `médicament ${id}`);
      sansFuite(await request(ctx.http).get(`/api/v1/pharmacien/pharmacies/${id}/disponibilites`).set('Cookie', pharmacien.cookie), `pharmacien ${id}`);
      sansFuite(await ecrire(patient, request(ctx.http).delete(`/api/v1/alertes/${id}`)), `alerte ${id}`);
      sansFuite(await ecrire(admin, request(ctx.http).post(`/api/v1/admin/pharmacies/${id}/nom`)).send({ nom: 'x' }), `admin ${id}`);
      sansFuite(await ecrire(admin, request(ctx.http).post(`/api/admin/rattachements/${id}/valider`)), `rattachement ${id}`);
    }
  });

  test('corps hostiles : valeurs, types, prototype, champs inconnus', async () => {
    const corps: unknown[] = [
      ...INJECTIONS.map((x) => ({ email: x, motDePasse: x })),
      { email: { $gt: '' }, motDePasse: { $ne: null } }, { email: ['a@b.tn'], motDePasse: [MDP] }, { email: null, motDePasse: null },
      { email: 1e308, motDePasse: true }, { __proto__: { admin: true }, email: 'a@b.tn', motDePasse: MDP },
      { constructor: { prototype: { admin: true } } }, { email: 'a@b.tn', motDePasse: MDP, role: 'administrateur' },
      [], 'texte', 42, null,
    ];
    for (const c of corps) {
      const r = await request(ctx.http).post('/api/comptes/connexion').set('Content-Type', 'application/json').send(JSON.stringify(c));
      sansFuite(r, `connexion ${JSON.stringify(c).slice(0, 60)}`);
    }
    for (const x of INJECTIONS) {
      sansFuite(await ecrire(admin, request(ctx.http).post('/api/v1/admin/pharmacies')).send({ rattachementId: x, nom: x, ville: x, gouvernorat: x }), `création ${x.slice(0, 30)}`);
      sansFuite(await ecrire(patient, request(ctx.http).post('/api/v1/alertes')).send({ medicamentId: x, gouvernorat: x, consentement: x }), `alerte ${x.slice(0, 30)}`);
      sansFuite(await request(ctx.http).post('/api/comptes/patients').send({ email: x, motDePasse: x, langue: x }), `inscription ${x.slice(0, 30)}`);
      sansFuite(await request(ctx.http).post('/api/v1/alertes/desabonnement').send({ jeton: x }), `désinscription ${x.slice(0, 30)}`);
      sansFuite(await request(ctx.http).post('/api/comptes/reinitialisation').send({ jeton: x, nouveauMotDePasse: x }), `réinitialisation ${x.slice(0, 30)}`);
    }
  });

  test('chaînes valides pour la validation mais hostiles pour la base (caractère nul, très long, Unicode)', async () => {
    const [p] = await fixtures(ctx, (tx) => tx.requete<{ uuid: string }>(
      `INSERT INTO annuaire.pharmacie (nom, ville, gouvernorat_code, statut_publication) VALUES ('Pharmacie Hostile', 'Tunis', 11, 'en_attente_position') RETURNING uuid`));
    for (const nom of ['Pharmacie\u0000Nulle', "Pharmacie ' OR 1=1 --", 'Pharmacie 😀 عكس‮']) {
      const r = await ecrire(admin, request(ctx.http).post(`/api/v1/admin/pharmacies/${p.uuid}/nom`)).send({ nom });
      if (r.status >= 400) sansFuite(r, `nom ${JSON.stringify(nom)}`);
      else expect(r.body.nom).toBe(nom);
    }
    sansFuite(await request(ctx.http).post('/api/comptes/connexion').send({ email: 'a\u0000@b.tn', motDePasse: MDP }), 'connexion avec caractère nul');
    sansFuite(await request(ctx.http).get('/api/v1/pharmacies').query({ nom: 'a\u0000b' }), 'recherche avec caractère nul');
  });

  test('JSON énorme, mal formé, profond, mauvais type de contenu', async () => {
    const gros = JSON.stringify({ email: 'a@b.tn', motDePasse: 'x'.repeat(20_000) });
    const r1 = await request(ctx.http).post('/api/comptes/connexion').set('Content-Type', 'application/json').send(gros);
    expect(r1.status).toBe(413); sansFuite(r1, 'JSON de 20 Ko');
    for (const brut of ['{"email":', '{email: "a"}', '{"a":1,}', 'null', '\u0000', '{"a":"\\ud800"}', '['.repeat(3000) + ']'.repeat(3000)]) {
      sansFuite(await request(ctx.http).post('/api/comptes/connexion').set('Content-Type', 'application/json').send(brut), `JSON ${brut.slice(0, 20)}`);
    }
    sansFuite(await request(ctx.http).post('/api/comptes/connexion').set('Content-Type', 'text/plain').send('email=a@b.tn'), 'text/plain');
    sansFuite(await request(ctx.http).post('/api/comptes/connexion').set('Content-Type', 'application/xml').send('<a>1</a>'), 'xml');
    sansFuite(await request(ctx.http).post('/api/comptes/connexion').set('Content-Type', 'application/x-www-form-urlencoded').send('email=a%40b.tn&motDePasse=x'), 'formulaire');
  });

  test('méthodes et routes inconnues', async () => {
    for (const [m, route] of [['get', '/api/nexiste/pas'], ['delete', '/api/v1/pharmacies'], ['put', '/api/comptes/connexion'], ['get', '/api/v1/admin/../../.env'], ['get', '/api/%2e%2e/%2e%2e/.env']] as const) {
      sansFuite(await request(ctx.http)[m](route), `${m} ${route}`);
    }
  });
});

describe('2. Journaux : ni adresse en clair, ni mot de passe, ni cookie, ni médicament associé à un compte', () => {
  test('parcours complet sur une application de développement (e-mails dans la console, tous les niveaux)', async () => {
    const lignes: string[] = [];
    const capture: LoggerService = {
      log: (m: unknown, ...c: unknown[]) => { lignes.push(`LOG ${String(m)} ${c.join(' ')}`); },
      error: (m: unknown, ...c: unknown[]) => { lignes.push(`ERROR ${String(m)} ${c.join(' ')}`); },
      warn: (m: unknown, ...c: unknown[]) => { lignes.push(`WARN ${String(m)} ${c.join(' ')}`); },
      debug: (m: unknown, ...c: unknown[]) => { lignes.push(`DEBUG ${String(m)} ${c.join(' ')}`); },
      verbose: (m: unknown, ...c: unknown[]) => { lignes.push(`VERBOSE ${String(m)} ${c.join(' ')}`); },
    };
    const config: Configuration = { ...ctx.config, environnement: 'development', fournisseurEmail: 'console' };
    const app = await creerApplication(config);
    app.useLogger(capture);
    await app.init();
    const http = app.getHttpServer() as App;
    const secrets: string[] = [MDP, 'faux-mot-de-passe-9'];
    try {
      // Comptes (créés par l'application de test pour lire les liens, utilisés sur l'application de développement).
      const emailPatient = await compteVerifie(ctx);
      const emailPharmacien = await compteVerifie(ctx, 'pharmaciens');
      const emailAdmin = await administrateur(ctx);
      const nouvelle = emailUnique('console');
      await request(http).post('/api/comptes/patients').send({ email: nouvelle, motDePasse: MDP }).expect(202);
      await request(http).post('/api/comptes/patients').send({ email: emailPatient, motDePasse: MDP }).expect(202); // adresse prise
      await request(http).post('/api/comptes/connexion').send({ email: emailPatient, motDePasse: 'faux-mot-de-passe-9' }).expect(401);
      const connexion = async (email: string): Promise<Session> => {
        const r = await request(http).post('/api/comptes/connexion').send({ email, motDePasse: MDP }).expect(200);
        const c = cookies(r);
        secrets.push(c[config.cookies.session].valeur, c[config.cookies.csrf].valeur);
        return { cookie: `${config.cookies.session}=${c[config.cookies.session].valeur}; ${config.cookies.csrf}=${c[config.cookies.csrf].valeur}`, csrf: c[config.cookies.csrf].valeur, utilisateur: r.body };
      };
      const patient = await connexion(emailPatient);
      const admin = await connexion(emailAdmin);
      await request(http).post('/api/comptes/mot-de-passe-oublie').send({ email: emailPatient }).expect(202);
      await request(http).post('/api/comptes/mot-de-passe-oublie').send({ email: emailUnique('inconnu') }).expect(202);

      // Alerte réellement envoyée par la console : pharmacie publiée, pharmacien validé, médicament déclaré.
      const MEDICAMENT = 'Journalisol 250 mg';
      const [m] = await fixtures(ctx, (tx) => tx.requete<{ uuid: string }>(`INSERT INTO annuaire.medicament (code_source, nom_commercial, dci, donnee_test) VALUES ('JR1', $1, 'journalisoline', true) RETURNING uuid`, [MEDICAMENT]));
      const [p] = await fixtures(ctx, (tx) => tx.requete<{ uuid: string }>(
        `INSERT INTO annuaire.pharmacie (nom, ville, gouvernorat_code, latitude, longitude, position_confirmee, source_gps, statut_publication)
         VALUES ('Pharmacie Journal', 'Tunis', 11, 36.8, 10.2, true, 'tunidoc', 'publiee') RETURNING uuid`));
      const pharmacienTest = await connecter(ctx, emailPharmacien);
      const d = await ecrire(pharmacienTest, request(ctx.http).post('/api/pharmacien/rattachement')).send({ pharmacieId: p.uuid }).expect(201);
      await ecrire(admin, request(http).post(`/api/admin/rattachements/${d.body.id}/valider`)).expect(200);
      const pharmacien = await connexion(emailPharmacien);
      await ecrire(patient, request(http).post('/api/v1/alertes')).send({ medicamentId: m.uuid, gouvernorat: null, consentement: true }).expect(200);
      await ecrire(pharmacien, request(http).put(`/api/v1/pharmacien/pharmacies/${p.uuid}/disponibilites/${m.uuid}`)).send({ statut: 'disponible' }).expect(200);
      await app.get(AlertesService).travauxTermines();

      // Erreurs, refus et actions d'administration.
      await ecrire(admin, request(http).post(`/api/v1/admin/pharmacies/${p.uuid}/nom`)).send({ nom: 'Pharmacie\u0000Nulle', nomRelu: true });
      await request(http).post('/api/comptes/connexion').set('Content-Type', 'application/json').send('{"email":');
      await request(http).get('/api/v1/admin/comptes').set('Cookie', patient.cookie).expect(403);
      await ecrire(admin, request(http).post(`/api/v1/admin/comptes/${(patient.utilisateur as { id: string }).id}/suspendre`)).send({ motif: 'test des journaux' }).expect(200);
      await request(http).post('/api/comptes/deconnexion').set('Cookie', admin.cookie).set('X-XSRF-TOKEN', admin.csrf);

      const journal = lignes.join('\n');
      // Le parcours a bien produit des journaux, dont l'e-mail d'alerte, sans son corps.
      expect(journal).toContain('E-mail (console, développement)');
      expect(journal).toContain('corps non journalisé : donnée de santé');
      expect(journal).toContain(`${emailPatient[0]}***@exemple.tn`);
      for (const adresse of [emailPatient, emailPharmacien, emailAdmin, nouvelle]) {
        expect({ adresse, presente: journal.toLowerCase().includes(adresse.toLowerCase()) }).toEqual({ adresse, presente: false });
      }
      for (const s of secrets) expect({ secret: s.slice(0, 4), present: journal.includes(s) }).toEqual({ secret: s.slice(0, 4), present: false });
      expect(journal).not.toContain(MEDICAMENT);
      expect(journal).not.toContain('Journalisol');
      expect(journal).not.toMatch(/mot_de_passe_hache|\$argon2/);
      // Liens de vérification et de réinitialisation : lisibles en développement (décision du 13 novembre 2026),
      // jamais dans un autre journal que celui des e-mails de la console.
      for (const l of lignes.filter((x) => /jeton=/.test(x))) expect(l).toContain('E-mail (console, développement)');
    } finally {
      await app.get(AlertesService).travauxTermines().catch(() => undefined);
      await app.close();
    }
  });
});
