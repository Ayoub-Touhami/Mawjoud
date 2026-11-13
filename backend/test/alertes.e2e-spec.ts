import request from 'supertest';
import { AlertesService } from '../src/alertes/alertes.service.js';
import { lireConfiguration } from '../src/config/configuration.js';
import {
  administrateur, commeActeur, compteVerifie, connecter, demarrer, emailUnique, fixtures, idCompteParEmail, jetonDuLien, MDP,
  type Contexte, type Session,
} from './aide.js';

/**
 * Partie 9b sur mawjoud_test : alertes des patients (F10 à F12), suivi et « tout confirmer » du pharmacien,
 * rappels, file d'envoi, purge. Pharmacies : PA publiée (Tunis, 11), PB publiée (Sfax, 61), PC prête à publier (Tunis).
 */
let ctx: Contexte;
let alertes: AlertesService;
const api = () => request(ctx.http);
const ecrire = (s: Session, r: request.Test) => r.set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf);
const REFUS = { code: '42501' };

let admin: Session; let idAdmin: string;
const P: Record<string, string> = {}; const ID: Record<string, string> = {};
const PH: Record<string, Session> = {}; const IDPH: Record<string, string> = {};
let patient: Session; let emailPatient: string; let idPatient: string;
let M: string[] = []; const NOMS = ['Alertamol 10 mg', 'Alertine 5 mg', 'Alerfène 20 mg', 'Alertose 1 g'];

async function pharmacie(cle: string, statut: string, gouvernorat: number, ville: string) {
  const [p] = await fixtures(ctx, (tx) => tx.requete<{ uuid: string; id: string }>(
    `INSERT INTO annuaire.pharmacie (nom, ville, gouvernorat_code, latitude, longitude, position_confirmee, source_gps, statut_publication)
     VALUES ($1, $2, $3, 36.9, 10.3, true, 'tunidoc', $4) RETURNING uuid, id`, [`Pharmacie Alerte ${cle}`, ville, gouvernorat, statut]));
  P[cle] = p.uuid; ID[cle] = p.id;
  const email = await compteVerifie(ctx, 'pharmaciens');
  const s = await connecter(ctx, email);
  const d = await ecrire(s, api().post('/api/pharmacien/rattachement')).send({ pharmacieId: p.uuid }).expect(201);
  await ecrire(admin, api().post(`/api/admin/rattachements/${d.body.id}/valider`)).expect(200);
  PH[cle] = await connecter(ctx, email); IDPH[cle] = await idCompteParEmail(ctx, email);
}

const declarer = (cle: string, med: string, statut = 'disponible') =>
  ecrire(PH[cle], api().put(`/api/v1/pharmacien/pharmacies/${P[cle]}/disponibilites/${med}`)).send({ statut }).expect(200);
const creer = (s: Session, medicamentId: string, gouvernorat: number | null) =>
  ecrire(s, api().post('/api/v1/alertes')).send({ medicamentId, gouvernorat, consentement: true });
const etat = async (uuid: string) =>
  (await ctx.base.requete<{ statut: string }>(`SELECT statut FROM prive.alerte WHERE uuid = $1`, [uuid]))[0]?.statut ?? 'effacee';

beforeAll(async () => {
  ctx = await demarrer();
  alertes = ctx.app.get(AlertesService);
  const emailAdmin = await administrateur(ctx);
  admin = await connecter(ctx, emailAdmin); idAdmin = await idCompteParEmail(ctx, emailAdmin);
  await pharmacie('A', 'publiee', 11, 'Tunis');
  await pharmacie('B', 'publiee', 61, 'Sfax');
  await pharmacie('C', 'pret_a_publier', 11, 'Tunis');
  emailPatient = await compteVerifie(ctx);
  patient = await connecter(ctx, emailPatient); idPatient = await idCompteParEmail(ctx, emailPatient);
  M = (await ctx.base.requete<{ uuid: string }>(
    `INSERT INTO annuaire.medicament (code_source, nom_commercial, dci, donnee_test)
     SELECT 'AL' || i, (ARRAY['Alertamol 10 mg', 'Alertine 5 mg', 'Alerfène 20 mg', 'Alertose 1 g'])[i], 'dci alerte ' || i, true
       FROM generate_series(1, 4) i ORDER BY i RETURNING uuid`)).map((m) => m.uuid);
});
afterAll(async () => {
  await alertes.travauxTermines();
  // Base partagée : les fiches publiées ici repassent à « pret_a_publier » pour les autres fichiers de tests.
  await commeActeur(ctx, idAdmin, (tx) => tx.requete(
    `UPDATE annuaire.pharmacie SET statut_publication = 'pret_a_publier' WHERE id = ANY($1::bigint[]) AND statut_publication = 'publiee'`,
    [Object.values(ID)]));
  await ctx.comptes.travauxTermines();
  await ctx.app.close();
});

describe('Créer une alerte (patient)', () => {
  test('consentement obligatoire, compte patient vérifié seulement', async () => {
    expect((await ecrire(patient, api().post('/api/v1/alertes')).send({ medicamentId: M[0], gouvernorat: 11 }).expect(400)).body.champs)
      .toEqual(['consentement']);
    await ecrire(patient, api().post('/api/v1/alertes')).send({ medicamentId: M[0], gouvernorat: 11, consentement: false }).expect(400);
    const nonVerifie = emailUnique();
    await api().post('/api/comptes/patients').send({ email: nonVerifie, motDePasse: MDP }).expect(202);
    const s = await connecter(ctx, nonVerifie);
    expect((await creer(s, M[0], 11).expect(403)).body).toEqual({ erreur: 'email-non-verifie' });
    await creer(PH.A, M[0], 11).expect(403);
    await api().post('/api/v1/alertes').send({ medicamentId: M[0], gouvernorat: 11, consentement: true }).expect(401);
  });

  test('création, puis la même : l\'alerte existante est renvoyée (F10), consentement daté', async () => {
    const r = await creer(patient, M[0], 11).expect(200);
    expect(r.body).toMatchObject({ existante: false, alerte: { etat: 'active', gouvernorat: { code: 11, nom: 'Tunis' }, medicament: { id: M[0] } } });
    const r2 = await creer(patient, M[0], 11).expect(200);
    expect(r2.body).toMatchObject({ existante: true, alerte: { id: r.body.alerte.id } });
    const [a] = await ctx.base.requete<{ consentement: boolean }>(
      `SELECT consentement_le IS NOT NULL AS consentement FROM prive.alerte WHERE uuid = $1`, [r.body.alerte.id]);
    expect(a.consentement).toBe(true);
    expect((await creer(patient, '00000000-0000-4000-8000-000000000000', null).expect(404)).body.erreur).toBe('introuvable');
    await creer(patient, M[0], 99).expect(400);
  });

  test('modifier le lieu ; doublon refusé ; supprimer, y compris l\'alerte d\'un autre (404)', async () => {
    const a = (await creer(patient, M[3], null).expect(200)).body.alerte.id;
    const b = (await creer(patient, M[3], 61).expect(200)).body.alerte.id;
    expect((await ecrire(patient, api().patch(`/api/v1/alertes/${b}`)).send({ gouvernorat: null }).expect(409)).body).toEqual({ erreur: 'doublon' });
    expect((await ecrire(patient, api().patch(`/api/v1/alertes/${b}`)).send({ gouvernorat: 13 }).expect(200)).body.gouvernorat.code).toBe(13);
    const autre = await connecter(ctx, await compteVerifie(ctx));
    await ecrire(autre, api().delete(`/api/v1/alertes/${a}`)).expect(404);
    await ecrire(patient, api().delete(`/api/v1/alertes/${a}`)).expect(204);
    await ecrire(patient, api().delete(`/api/v1/alertes/${b}`)).expect(204);
    expect(await etat(a)).toBe('effacee');
  });

  test('plafond d\'alertes actives par compte (ici 2) : 409', async () => {
    const autre = await demarrer({ alertes: { ...lireConfiguration().alertes, maxParCompte: 2 } });
    try {
      const s = await connecter(autre, await compteVerifie(autre));
      for (const g of [11, 12]) await request(autre.http).post('/api/v1/alertes').set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf)
        .send({ medicamentId: M[1], gouvernorat: g, consentement: true }).expect(200);
      const r = await request(autre.http).post('/api/v1/alertes').set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf)
        .send({ medicamentId: M[1], gouvernorat: 13, consentement: true }).expect(409);
      expect(r.body).toEqual({ erreur: 'trop-d-alertes', maximum: 2 });
    } finally { await autre.app.close(); }
  });
});

describe('Déclenchement (F11, R11)', () => {
  test('disponibilité dans le bon gouvernorat : un seul e-mail, sujet sans le médicament, lien de désinscription', async () => {
    const tunis = (await creer(patient, M[0], 11).expect(200)).body.alerte.id;   // existe déjà (test précédent)
    const sfax = (await creer(patient, M[0], 61).expect(200)).body.alerte.id;
    await declarer('A', M[0]);
    await alertes.travauxTermines();
    expect(await etat(tunis)).toBe('terminee');
    expect(await etat(sfax)).toBe('active');
    const mail = ctx.emails.dernierPour(emailPatient)!;
    expect(mail.sujet).not.toContain('Alertamol');
    expect(mail.texte).toContain('Alertamol 10 mg');
    expect(mail.texte).toContain('Pharmacie Alerte A');
    expect(mail.texte).toContain(`/pharmacie/${P.A}`);
    expect(mail.texte).toContain('/compte/desabonnement?jeton=');
    const [e] = await ctx.base.requete<{ statut: string; n: number }>(
      `SELECT max(e.statut) AS statut, count(*)::int AS n FROM prive.envoi_email e JOIN prive.alerte a ON a.id = e.alerte_id WHERE a.uuid = $1`, [tunis]);
    expect(e).toEqual({ statut: 'envoye', n: 1 });
    // Nouvelle déclaration : l'alerte est terminée, aucun second e-mail.
    const avant = ctx.emails.envoyes.length;
    await declarer('A', M[0], 'quantite-limitee');
    await alertes.travauxTermines();
    expect(ctx.emails.envoyes.length).toBe(avant);
    const liste = await api().get('/api/v1/alertes').set('Cookie', patient.cookie).expect(200);
    expect(liste.body.elements.find((x: { id: string }) => x.id === tunis)).toMatchObject({ etat: 'terminee', declencheeLe: expect.any(String) });
  });

  test('« en rupture » ne déclenche rien ; une pharmacie non publiée non plus, jusqu\'à sa publication', async () => {
    const a = (await creer(patient, M[1], 11).expect(200)).body.alerte.id;
    await declarer('A', M[1], 'en-rupture');
    await declarer('C', M[1]);
    await alertes.travauxTermines();
    expect(await etat(a)).toBe('active');
    await ecrire(admin, api().post(`/api/v1/admin/pharmacies/${P.C}/statut`)).send({ statut: 'publiee' }).expect(200);
    await alertes.travauxTermines();
    expect(await etat(a)).toBe('terminee');
    expect(ctx.emails.dernierPour(emailPatient)!.texte).toContain('Pharmacie Alerte C');
  });
});

describe('Désinscription par lien (F12)', () => {
  test('sans connexion : toutes les alertes actives effacées ; le lien reste valable ; lien inconnu : 400', async () => {
    const jeton = jetonDuLien(ctx.emails.dernierPour(emailPatient)!.texte);
    const a = (await creer(patient, M[2], null).expect(200)).body.alerte.id;
    const r = await api().post('/api/v1/alertes/desabonnement').send({ jeton }).expect(200);
    expect(r.body.alertesArretees).toBeGreaterThanOrEqual(2);
    expect(await etat(a)).toBe('effacee');
    const [{ n }] = await ctx.base.requete<{ n: number }>(
      `SELECT count(*)::int AS n FROM prive.alerte WHERE utilisateur_id = $1 AND statut = 'active'`, [idPatient]);
    expect(n).toBe(0);
    expect((await api().post('/api/v1/alertes/desabonnement').send({ jeton }).expect(200)).body).toEqual({ alertesArretees: 0 });
    await api().post('/api/v1/alertes/desabonnement').send({ jeton: 'Z'.repeat(43) }).expect(400);
    // Seule l'empreinte du jeton est en base.
    const [{ h }] = await ctx.base.requete<{ h: number }>(
      `SELECT count(*)::int AS h FROM prive.jeton WHERE type = 'desabonnement' AND jeton_hache = sha256(convert_to($1, 'UTF8'))`, [jeton]);
    expect(h).toBe(1);
  });

  test('vie privée : aucun médicament ni identifiant d\'alerte dans le journal d\'audit', async () => {
    const [{ texte }] = await ctx.base.requete<{ texte: string }>(`SELECT coalesce(string_agg(detail::text || cible_id, ' '), '') AS texte FROM prive.journal_audit`);
    for (const nom of NOMS) expect(texte).not.toContain(nom);
    for (const m of M) expect(texte).not.toContain(m);
  });
});

describe('Suivi d\'un médicament par le pharmacien', () => {
  test('suivre sans déclarer, liste des suivis, absent des disponibilités ; R9 en API et en base', async () => {
    const r = await ecrire(PH.B, api().put(`/api/v1/pharmacien/pharmacies/${P.B}/suivis/${M[3]}`)).expect(200);
    expect(r.body).toEqual({ nouveau: true });
    expect((await ecrire(PH.B, api().put(`/api/v1/pharmacien/pharmacies/${P.B}/suivis/${M[3]}`)).expect(200)).body).toEqual({ nouveau: false });
    expect((await api().get(`/api/v1/pharmacien/pharmacies/${P.B}/suivis`).set('Cookie', PH.B.cookie).expect(200)).body.elements).toEqual([M[3]]);
    expect((await api().get(`/api/v1/pharmacien/pharmacies/${P.B}/disponibilites`).set('Cookie', PH.B.cookie).expect(200)).body.total).toBe(0);
    await ecrire(PH.A, api().put(`/api/v1/pharmacien/pharmacies/${P.B}/suivis/${M[2]}`)).expect(404);
    const [m] = await ctx.base.requete<{ id: string }>(`SELECT id FROM annuaire.medicament WHERE uuid = $1`, [M[2]]);
    await expect(ctx.base.requete(`INSERT INTO annuaire.stock (pharmacie_id, medicament_id) VALUES ($1, $2)`, [ID.B, m.id])).rejects.toMatchObject(REFUS);
    await expect(commeActeur(ctx, IDPH.A, (tx) => tx.requete(`INSERT INTO annuaire.stock (pharmacie_id, medicament_id) VALUES ($1, $2)`, [ID.B, m.id])))
      .rejects.toMatchObject(REFUS);
    // Arrêter le suivi : la route de retrait existante.
    await ecrire(PH.B, api().delete(`/api/v1/pharmacien/pharmacies/${P.B}/disponibilites/${M[3]}`)).expect(204);
  });
});

describe('« Tout confirmer »', () => {
  test('redéclare chaque statut à la date du serveur, sans le changer ; historique et journal ; R9', async () => {
    // Déclarations anciennes de A (déclarant vérifié : la base l'accepte).
    await ctx.base.requete(`UPDATE annuaire.stock SET declare_le = now() - interval '3 days' WHERE pharmacie_id = $1 AND statut IS NOT NULL`, [ID.A]);
    const [{ h0 }] = await ctx.base.requete<{ h0: number }>(`SELECT count(*)::int AS h0 FROM annuaire.historique_stock WHERE pharmacie_id = $1`, [ID.A]);
    const r = await ecrire(PH.A, api().post(`/api/v1/pharmacien/pharmacies/${P.A}/disponibilites/confirmer-tout`)).expect(200);
    expect(r.body.confirmees).toBe(2);
    expect(r.body.elements.map((e: { statut: string }) => e.statut).sort()).toEqual(['en-rupture', 'quantite-limitee']);
    const [s] = await ctx.base.requete<{ vieux: number }>(
      `SELECT count(*) FILTER (WHERE declare_le < now() - interval '1 minute')::int AS vieux FROM annuaire.stock WHERE pharmacie_id = $1 AND statut IS NOT NULL`, [ID.A]);
    expect(s.vieux).toBe(0);
    const [{ h1 }] = await ctx.base.requete<{ h1: number }>(`SELECT count(*)::int AS h1 FROM annuaire.historique_stock WHERE pharmacie_id = $1`, [ID.A]);
    expect(h1).toBe(h0 + 2);
    const [j] = await ctx.base.requete<{ detail: { declarations: number } }>(
      `SELECT detail FROM prive.journal_audit WHERE action = 'confirmer_tout' AND cible_id = $1`, [P.A]);
    expect(j.detail).toEqual({ declarations: 2 });
    await ecrire(PH.B, api().post(`/api/v1/pharmacien/pharmacies/${P.A}/disponibilites/confirmer-tout`)).expect(404);
  });
});

describe('Rappels, file d\'envoi, purge (tâche planifiée)', () => {
  test('pharmacie publiée sans mise à jour depuis N jours : un rappel, au plus un par période', async () => {
    await ctx.base.requete(`UPDATE annuaire.stock SET declare_le = now() - interval '10 days' WHERE pharmacie_id = $1 AND statut IS NOT NULL`, [ID.A]);
    await ctx.base.requete(`UPDATE prive.rattachement_pharmacien SET decide_le = now() - interval '20 days' WHERE pharmacie_id = $1 AND statut = 'validee'`, [ID.A]);
    const rappelsA = async () => (await ctx.base.requete<{ n: number }>(
      `SELECT count(*)::int AS n FROM prive.envoi_email WHERE type = 'rappel_mise_a_jour' AND pharmacie_id = $1`, [ID.A]))[0].n;
    const bilan = await alertes.executerTaches();
    expect(Object.keys(bilan).sort()).toEqual(['alertesEffacees', 'echecs', 'envoyes', 'rappelsPrepares']);
    expect(await rappelsA()).toBe(1);
    const email = (await ctx.base.requete<{ email: string }>(`SELECT email FROM prive.utilisateur WHERE id = $1`, [IDPH.A]))[0].email;
    expect(ctx.emails.dernierPour(email)!.sujet).toContain('mettre à jour');
    await alertes.executerTaches();
    expect(await rappelsA()).toBe(1);
    // B a été validée à l'instant : pas de rappel.
    expect((await ctx.base.requete<{ n: number }>(
      `SELECT count(*)::int AS n FROM prive.envoi_email WHERE type = 'rappel_mise_a_jour' AND pharmacie_id = $1`, [ID.B]))[0].n).toBe(0);
  });

  test('échec d\'envoi : nouvel essai plus tard, puis abandon après le nombre d\'essais maximal', async () => {
    const a = (await creer(patient, M[3], null).expect(200)).body.alerte.id;
    const original = ctx.emails.envoyer.bind(ctx.emails);
    ctx.emails.envoyer = async () => { throw new Error('serveur e-mail indisponible'); };
    try {
      await declarer('B', M[3]);
      await alertes.travauxTermines();
      const lire = async () => (await ctx.base.requete<{ statut: string; tentatives: number; plus_tard: boolean }>(
        `SELECT e.statut, e.tentatives, e.prochaine_tentative_le > now() AS plus_tard
           FROM prive.envoi_email e JOIN prive.alerte al ON al.id = e.alerte_id WHERE al.uuid = $1`, [a]))[0];
      expect(await lire()).toEqual({ statut: 'a_envoyer', tentatives: 1, plus_tard: true });
      await ctx.base.requete(
        `UPDATE prive.envoi_email SET tentatives = 4, prochaine_tentative_le = now() WHERE alerte_id = (SELECT id FROM prive.alerte WHERE uuid = $1)`, [a]);
      const b = await alertes.executerTaches();
      expect(b.echecs).toBeGreaterThanOrEqual(1);
      expect((await lire()).statut).toBe('abandonne');
    } finally {
      ctx.emails.envoyer = original;
    }
  });

  test('purge : une alerte déclenchée depuis plus de 30 jours est effacée, avec son e-mail', async () => {
    const [vieille] = await ctx.base.requete<{ uuid: string }>(
      `UPDATE prive.alerte SET declenchee_le = now() - interval '31 days' WHERE utilisateur_id = $1 AND statut = 'terminee'
        RETURNING uuid`, [idPatient]);
    expect(vieille).toBeDefined();
    const b = await alertes.executerTaches();
    expect(b.alertesEffacees).toBeGreaterThanOrEqual(1);
    expect(await etat(vieille.uuid)).toBe('effacee');
  });
});

describe('Suppression d\'un compte', () => {
  test('efface ses alertes, ses jetons de désinscription et la trace de ses e-mails (ON DELETE CASCADE)', async () => {
    const email = await compteVerifie(ctx);
    const s = await connecter(ctx, email);
    const id = await idCompteParEmail(ctx, email);
    await creer(s, M[2], null).expect(200);       // déclenchée ci-dessous : e-mail et jeton
    await creer(s, M[1], 61).expect(200);         // reste active
    await declarer('A', M[2]);
    await alertes.travauxTermines();
    const compter = async () => (await ctx.base.requete<{ alertes: number; jetons: number; emails: number }>(
      `SELECT (SELECT count(*)::int FROM prive.alerte WHERE utilisateur_id = $1) AS alertes,
              (SELECT count(*)::int FROM prive.jeton WHERE utilisateur_id = $1 AND type = 'desabonnement') AS jetons,
              (SELECT count(*)::int FROM prive.envoi_email WHERE utilisateur_id = $1 AND type = 'alerte') AS emails`, [id]))[0];
    expect(await compter()).toEqual({ alertes: 2, jetons: 1, emails: 1 });
    // Un jeton ne contient aucun texte libre (donc aucun nom de médicament) : empreinte, type, dates.
    const colonnes = await ctx.base.requete<{ c: string }>(
      `SELECT column_name || ':' || data_type AS c FROM information_schema.columns WHERE table_schema = 'prive' AND table_name = 'jeton' ORDER BY ordinal_position`);
    expect(colonnes.map((x) => x.c)).toEqual(['id:bigint', 'utilisateur_id:bigint', 'type:text', 'jeton_hache:bytea',
      'expire_le:timestamp with time zone', 'utilise_le:timestamp with time zone', 'created_at:timestamp with time zone']);
    await ctx.base.requete(`DELETE FROM prive.utilisateur WHERE id = $1`, [id]);
    expect(await compter()).toEqual({ alertes: 0, jetons: 0, emails: 0 });
  });
});

describe('Limitation de débit des alertes', () => {
  test('60 requêtes par minute et par compte (ici 3)', async () => {
    const autre = await demarrer({ limites: { ...lireConfiguration().limites, alertesParCompte: { max: 3, fenetreMs: 60_000 } } });
    try {
      for (let i = 0; i < 3; i++) await request(autre.http).get('/api/v1/alertes').set('Cookie', patient.cookie).expect(200);
      expect((await request(autre.http).get('/api/v1/alertes').set('Cookie', patient.cookie).expect(429)).body.erreur).toBe('trop-de-tentatives');
    } finally { await autre.app.close(); }
  });
});
