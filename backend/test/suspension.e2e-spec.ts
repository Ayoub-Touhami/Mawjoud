import request from 'supertest';
import { administrateur, compteVerifie, connecter, demarrer, emailUnique, pharmacie, type Contexte, type Session } from './aide.js';

/**
 * Un pharmacien suspendu ne peut ni modifier un stock, ni une position, ni demander un rattachement.
 * Stock et position n'ont pas encore de route (Parties 6 à 8) : ils sont vérifiés dans la base même,
 * avec le compte de l'API (mawjoud_api), ce qui prouve que le refus tient même si le back-end se trompe.
 * Chaque refus est précédé d'un témoin qui réussit avant la suspension.
 */
let ctx: Contexte;
beforeAll(async () => { ctx = await demarrer(); });
afterAll(async () => { await ctx.comptes.travauxTermines(); await ctx.app.close(); });
const api = () => request(ctx.http);

const DROIT_REFUSE = { code: '42501' }; // insufficient_privilege, levé par les déclencheurs

async function idDe(email: string): Promise<string> {
  return (await ctx.base.requete<{ id: string }>(`SELECT id FROM prive.utilisateur WHERE email = $1`, [email]))[0].id;
}

/** Change la position d'une fiche au nom d'un compte, comme le fera l'API (SET LOCAL, motif obligatoire). */
function changerPosition(pharmacieId: string, acteurId: string, latitude: number) {
  return ctx.base.transaction(async (tx) => {
    await tx.requete(`SELECT set_config('mawjoud.acteur_id', $1, true), set_config('mawjoud.motif_position', 'test suspension', true)`, [acteurId]);
    await tx.requete(
      `UPDATE annuaire.pharmacie SET latitude = $2, longitude = 10.18, source_gps = 'saisie_pharmacien' WHERE id = $1`,
      [pharmacieId, latitude],
    );
  });
}

function proposerPosition(pharmacieId: string, demandeurId: string) {
  return ctx.base.requete<{ id: string }>(
    `INSERT INTO prive.demande_position (pharmacie_id, demandeur_id, latitude, longitude) VALUES ($1, $2, 36.81, 10.17) RETURNING id`,
    [pharmacieId, demandeurId],
  );
}

function declarerStock(pharmacieId: string, medicamentId: string, declarant: string, statut: string) {
  return ctx.base.requete(
    `INSERT INTO annuaire.stock (pharmacie_id, medicament_id, statut, declare_le, declare_par) VALUES ($1, $2, $3, now(), $4)
     ON CONFLICT (pharmacie_id, medicament_id) DO UPDATE SET statut = EXCLUDED.statut, declare_le = now(), declare_par = EXCLUDED.declare_par`,
    [pharmacieId, medicamentId, statut, declarant],
  );
}

describe('Pharmacien suspendu', () => {
  let emailPharmacien: string;
  let pharmacien: Session;
  let pharmacienId: string;
  let adminId: string;
  let pharmacieId: string; // identifiant interne
  let medicaments: string[];

  beforeAll(async () => {
    // Pharmacien vérifié, rattaché à sa pharmacie par l'administrateur.
    const emailAdmin = await administrateur(ctx);
    const admin = await connecter(ctx, emailAdmin);
    adminId = await idDe(emailAdmin);
    emailPharmacien = await compteVerifie(ctx, 'pharmaciens');
    pharmacien = await connecter(ctx, emailPharmacien);
    pharmacienId = await idDe(emailPharmacien);
    const pharmacieUuid = await pharmacie(ctx);
    const d = await api().post('/api/pharmacien/rattachement').set('Cookie', pharmacien.cookie).set('X-XSRF-TOKEN', pharmacien.csrf)
      .send({ pharmacieId: pharmacieUuid }).expect(201);
    await api().post(`/api/admin/rattachements/${d.body.id}/valider`).set('Cookie', admin.cookie).set('X-XSRF-TOKEN', admin.csrf).expect(200);
    pharmacieId = (await ctx.base.requete<{ id: string }>(`SELECT id FROM annuaire.pharmacie WHERE uuid = $1`, [pharmacieUuid]))[0].id;
    const suffixe = emailUnique('m').slice(0, 20);
    medicaments = (await ctx.base.requete<{ id: string }>(
      `INSERT INTO annuaire.medicament (code_source, nom_commercial, dci) VALUES ($1, $2, 'dci de test'), ($3, $4, 'dci de test') RETURNING id`,
      [`T1-${suffixe}`, `Médicament A ${suffixe}`, `T2-${suffixe}`, `Médicament B ${suffixe}`],
    )).map((m) => m.id);

    // Témoins : avant la suspension, tout passe.
    await declarerStock(pharmacieId, medicaments[0], pharmacienId, 'disponible');
    const [demande] = await proposerPosition(pharmacieId, pharmacienId);
    await ctx.base.requete(`DELETE FROM prive.demande_position WHERE id = $1`, [demande.id]); // libère « une seule en attente »
    await changerPosition(pharmacieId, pharmacienId, 36.80);

    // Suspension par l'administrateur (sa route viendra avec l'administration, Partie 8).
    await ctx.base.requete(`UPDATE prive.utilisateur SET suspendu = true WHERE id = $1`, [pharmacienId]);
  });

  test('ne peut pas modifier un stock (ni changer un statut, ni en déclarer un nouveau)', async () => {
    await expect(declarerStock(pharmacieId, medicaments[0], pharmacienId, 'en_rupture')).rejects.toMatchObject(DROIT_REFUSE);
    await expect(declarerStock(pharmacieId, medicaments[1], pharmacienId, 'disponible')).rejects.toMatchObject(DROIT_REFUSE);
    const [s] = await ctx.base.requete<{ statut: string }>(
      `SELECT statut FROM annuaire.stock WHERE pharmacie_id = $1 AND medicament_id = $2`, [pharmacieId, medicaments[0]]);
    expect(s.statut).toBe('disponible'); // inchangé
  });

  test('ne peut pas modifier une position (ni la proposer, ni la changer en son nom)', async () => {
    await expect(proposerPosition(pharmacieId, pharmacienId)).rejects.toMatchObject(DROIT_REFUSE);
    await expect(changerPosition(pharmacieId, pharmacienId, 36.82)).rejects.toMatchObject(DROIT_REFUSE);
    const [p] = await ctx.base.requete<{ latitude: number }>(`SELECT latitude FROM annuaire.pharmacie WHERE id = $1`, [pharmacieId]);
    expect(p.latitude).toBe(36.8); // inchangée
    // La règle vise le compte suspendu, pas la fiche : l'administrateur peut toujours corriger.
    await changerPosition(pharmacieId, adminId, 36.83);
  });

  test('ne peut pas demander de rattachement : refusé par l\'API (compte-suspendu) et par la base', async () => {
    const emailB = await compteVerifie(ctx, 'pharmaciens');
    const b = await connecter(ctx, emailB);
    const idB = await idDe(emailB);
    await ctx.base.requete(`UPDATE prive.utilisateur SET suspendu = true WHERE id = $1`, [idB]);

    const r = await api().post('/api/pharmacien/rattachement').set('Cookie', b.cookie).set('X-XSRF-TOKEN', b.csrf)
      .send({ pharmacieId: await pharmacie(ctx) }).expect(403);
    expect(r.body).toEqual({ erreur: 'compte-suspendu' });
    const r2 = await api().post('/api/pharmacien/rattachement').set('Cookie', b.cookie).set('X-XSRF-TOKEN', b.csrf)
      .send({ ajout: { nom: 'Pharmacie X', adresse: 'rue Y', ville: 'Sfax', telephone: '+21674000000' } }).expect(403);
    expect(r2.body).toEqual({ erreur: 'compte-suspendu' });

    // Même si le back-end laissait passer : la base refuse.
    await expect(ctx.base.requete(
      `INSERT INTO prive.rattachement_pharmacien (utilisateur_id, ajout_nom, ajout_ville) VALUES ($1, 'Pharmacie X', 'Sfax')`, [idB],
    )).rejects.toMatchObject(DROIT_REFUSE);
    const [n] = await ctx.base.requete<{ n: number }>(`SELECT count(*)::int AS n FROM prive.rattachement_pharmacien WHERE utilisateur_id = $1`, [idB]);
    expect(n.n).toBe(0);
  });

  test('peut encore se connecter, voir son état et sa demande, et se déconnecter', async () => {
    const moi = await api().get('/api/comptes/moi').set('Cookie', pharmacien.cookie).expect(200);
    expect(moi.body).toMatchObject({ role: 'pharmacien', suspendu: true, compteVerifie: true });
    const d = await api().get('/api/pharmacien/rattachement').set('Cookie', pharmacien.cookie).expect(200);
    expect(d.body.etat).toBe('validee');
    const s = await connecter(ctx, emailPharmacien);
    await api().post('/api/comptes/deconnexion').set('Cookie', s.cookie).set('X-XSRF-TOKEN', s.csrf).expect(204);
  });
});
