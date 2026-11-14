import { demarrer, idCompteParEmail, compteVerifie, type Contexte } from './aide.js';

/**
 * Partie 9d : audit des droits. Le tableau réel (lu dans le catalogue de PostgreSQL avec le compte de l'API)
 * doit être exactement le tableau attendu ci-dessous : un droit en plus ou en moins fait échouer le test.
 * Tableau expliqué dans docs/SECURITE.md ; dernière correction : migration 036.
 */
let ctx: Contexte;
beforeAll(async () => { ctx = await demarrer(); });
afterAll(async () => { await ctx.comptes.travauxTermines(); await ctx.app.close(); });
const REFUS = { code: '42501' };

/** Droits de mawjoud_application sur toute une table ou vue. */
const TABLES: Record<string, string> = {
  'annuaire.gouvernorat': 'SELECT',
  'annuaire.historique_position': 'INSERT',
  'annuaire.historique_stock': 'INSERT,SELECT',
  'annuaire.horaire': 'DELETE,INSERT,SELECT',
  'annuaire.medicament': 'SELECT',
  'annuaire.pharmacie': 'SELECT',
  'annuaire.stock': 'DELETE,INSERT,SELECT',
  'prive.alerte': 'DELETE,INSERT,SELECT',
  'prive.demande_position': 'INSERT,SELECT',
  'prive.envoi_email': 'INSERT,SELECT',
  'prive.jeton': 'INSERT,SELECT',
  'prive.journal_audit': 'INSERT,SELECT',
  'prive.rattachement_pharmacien': 'INSERT,SELECT',
  'prive.session': 'DELETE,INSERT,SELECT',
  'prive.utilisateur': 'INSERT,SELECT',
  'publique.gouvernorat': 'SELECT',
  'publique.horaire': 'SELECT',
  'publique.medicament': 'SELECT',
  'publique.pharmacie': 'SELECT',
  'publique.stock': 'SELECT',
};

/** Droits accordés colonne par colonne à mawjoud_application. */
const COLONNES: Record<string, string> = {
  'annuaire.pharmacie INSERT': 'nom,rue,quartier,ville,code_postal,gouvernorat_code,telephone_principal,sources',
  'annuaire.pharmacie UPDATE': 'nom,telephone_principal,telephones_autres,latitude,longitude,position_confirmee,source_gps,precision_gps,garde,statut_publication,fusionnee_dans,nom_a_verifier',
  'annuaire.stock UPDATE': 'statut,declare_le,declare_par',
  'prive.alerte UPDATE': 'gouvernorat_code,statut,declenchee_le,declenchee_par_pharmacie',
  'prive.demande_position UPDATE': 'statut,motif_refus,decide_par,decide_le',
  'prive.envoi_email UPDATE': 'statut,tentatives,prochaine_tentative_le,derniere_erreur,envoye_le',
  'prive.jeton UPDATE': 'expire_le,utilise_le',
  'prive.message_contact INSERT': 'nom,email,sujet,message,pharmacie_id', // formulaire de contact (037)
  'prive.message_contact SELECT': 'uuid,pharmacie_id',
  'prive.message_contact UPDATE': 'pharmacie_id',
  'prive.rattachement_pharmacien UPDATE': 'pharmacie_id,statut,conflit,motif_code,motif_precision,decide_par,decide_le',
  'prive.session UPDATE': 'donnees,derniere_activite_le,expire_le',
  'prive.signalement SELECT': 'uuid,pharmacie_id',
  'prive.signalement UPDATE': 'pharmacie_id',
  'prive.utilisateur UPDATE': 'email_verifie_le,suspendu,mot_de_passe_hache',
};

const trie = (s: string) => s.split(',').sort().join(',');

describe('Tableau des droits de la base, comparé à l\'attendu', () => {
  test('tables et vues : mawjoud_application seulement, rien pour PUBLIC ni pour mawjoud_api en direct', async () => {
    const lignes = await ctx.base.requete<{ objet: string; role: string; droits: string }>(
      `SELECT n.nspname || '.' || c.relname AS objet, CASE WHEN g.grantee = 0 THEN 'PUBLIC' ELSE g.grantee::regrole::text END AS role,
              string_agg(g.privilege_type, ',' ORDER BY g.privilege_type) AS droits
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) g
        WHERE n.nspname IN ('public', 'annuaire', 'prive', 'publique') AND c.relkind IN ('r', 'v', 'm', 'p') AND g.grantee <> c.relowner
        GROUP BY 1, 2`);
    const application = Object.fromEntries(lignes.filter((l) => l.role === 'mawjoud_application').map((l) => [l.objet, l.droits]));
    expect(application).toEqual(TABLES);
    // Vues publiques : aussi au rôle de lecture publique (SELECT seulement). Personne d'autre.
    // mawjoud_test_fixtures : rôle des tests, créé dans mawjoud_test seulement (refusé en production au démarrage).
    const autres = lignes.filter((l) => l.role !== 'mawjoud_application' && l.role !== 'mawjoud_test_fixtures');
    expect(autres.every((l) => l.role === 'mawjoud_lecture_publique' && l.objet.startsWith('publique.') && l.droits === 'SELECT')).toBe(true);
    expect(autres.map((l) => l.objet).sort()).toEqual(Object.keys(TABLES).filter((t) => t.startsWith('publique.')).sort());
  });

  test('colonnes : seules celles que l\'API écrit (jamais le rôle ni l\'adresse d\'un compte)', async () => {
    const lignes = await ctx.base.requete<{ cle: string; colonnes: string }>(
      `SELECT n.nspname || '.' || c.relname || ' ' || g.privilege_type AS cle, string_agg(a.attname, ',') AS colonnes
         FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(a.attacl) g
        WHERE a.attacl IS NOT NULL AND n.nspname IN ('public', 'annuaire', 'prive', 'publique')
          AND g.grantee = 'mawjoud_application'::regrole
        GROUP BY 1`);
    const reel = Object.fromEntries(lignes.map((l) => [l.cle, trie(l.colonnes)]));
    expect(reel).toEqual(Object.fromEntries(Object.entries(COLONNES).map(([k, v]) => [k, trie(v)])));
    const autres = await ctx.base.requete(
      `SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace, aclexplode(a.attacl) g
        WHERE a.attacl IS NOT NULL AND n.nspname IN ('annuaire', 'prive', 'publique') AND g.grantee <> 'mawjoud_application'::regrole
          AND g.grantee <> c.relowner AND g.grantee::regrole::text <> 'mawjoud_test_fixtures'`);
    expect(autres).toEqual([]);
  });

  test('rôles : mawjoud_api sans privilège spécial, membre de l\'application et (SET seulement) de la lecture publique', async () => {
    const roles = await ctx.base.requete(
      `SELECT rolname, rolsuper, rolcreaterole, rolcreatedb, rolcanlogin, rolbypassrls, rolreplication
         FROM pg_roles WHERE rolname IN ('mawjoud_api', 'mawjoud_application', 'mawjoud_lecture_publique') ORDER BY 1`);
    expect(roles).toEqual([
      { rolname: 'mawjoud_api', rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolcanlogin: true, rolbypassrls: false, rolreplication: false },
      { rolname: 'mawjoud_application', rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolcanlogin: false, rolbypassrls: false, rolreplication: false },
      { rolname: 'mawjoud_lecture_publique', rolsuper: false, rolcreaterole: false, rolcreatedb: false, rolcanlogin: false, rolbypassrls: false, rolreplication: false },
    ]);
    const membres = await ctx.base.requete(
      `SELECT r.rolname AS role, am.inherit_option AS herite, am.admin_option AS admin
         FROM pg_auth_members am JOIN pg_roles r ON r.oid = am.roleid WHERE am.member = 'mawjoud_api'::regrole ORDER BY 1`);
    expect(membres).toEqual([
      { role: 'mawjoud_application', herite: true, admin: false },
      { role: 'mawjoud_lecture_publique', herite: false, admin: false },
      { role: 'mawjoud_test_fixtures', herite: false, admin: false }, // mawjoud_test seulement (preparer-base-test.ps1)
    ]);
  });

  test('base et schémas : ni CREATE, ni TEMPORARY pour l\'API', async () => {
    const [d] = await ctx.base.requete<{ creer: boolean; temp: boolean; connecter: boolean }>(
      `SELECT has_database_privilege(current_database(), 'CREATE') AS creer, has_database_privilege(current_database(), 'TEMPORARY') AS temp,
              has_database_privilege(current_database(), 'CONNECT') AS connecter`);
    expect(d).toEqual({ creer: false, temp: false, connecter: true });
    const schemas = await ctx.base.requete<{ s: string }>(
      `SELECT nspname AS s FROM pg_namespace WHERE nspname IN ('public', 'annuaire', 'prive', 'publique') AND has_schema_privilege(oid, 'CREATE')`);
    expect(schemas).toEqual([]);
  });
});

describe('Droits retirés par la migration 036 (SQL direct avec mawjoud_api)', () => {
  test('ni changer le rôle ou l\'adresse d\'un compte, ni le supprimer', async () => {
    const id = await idCompteParEmail(ctx, await compteVerifie(ctx));
    await expect(ctx.base.requete(`UPDATE prive.utilisateur SET role = 'administrateur' WHERE id = $1`, [id])).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`UPDATE prive.utilisateur SET email = 'pirate@exemple.tn' WHERE id = $1`, [id])).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`DELETE FROM prive.utilisateur WHERE id = $1`, [id])).rejects.toMatchObject(REFUS);
    expect(await ctx.base.requete(`SELECT role FROM prive.utilisateur WHERE id = $1`, [id])).toEqual([{ role: 'patient' }]);
  });

  test('ni noms internes des pharmaciens, ni écriture du catalogue, des signalements ou des messages', async () => {
    await expect(ctx.base.requete(`SELECT * FROM prive.pharmacie_interne`)).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`INSERT INTO annuaire.medicament (code_source, nom_commercial, dci) VALUES ('X1', 'Intrus', 'intrus')`)).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`UPDATE annuaire.medicament SET nom_commercial = 'Intrus'`)).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`SELECT texte FROM prive.signalement`)).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`SELECT email FROM prive.message_contact`)).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`DELETE FROM prive.signalement`)).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`SELECT * FROM annuaire.historique_position`)).rejects.toMatchObject(REFUS);
  });

  test('ni jeton réutilisable, ni table temporaire', async () => {
    await expect(ctx.base.requete(`UPDATE prive.jeton SET jeton_hache = jeton_hache`)).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`DELETE FROM prive.jeton`)).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`UPDATE prive.session SET utilisateur_id = utilisateur_id`)).rejects.toMatchObject(REFUS);
    await expect(ctx.base.requete(`CREATE TEMP TABLE intrus (x int)`)).rejects.toMatchObject(REFUS);
  });
});
