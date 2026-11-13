import { Inject, Injectable } from '@nestjs/common';
import { AlertesService } from '../alertes/alertes.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BaseService, type Executeur } from '../base/base.service.js';
import { CONFIGURATION } from '../config/jetons-injection.js';
import type { Configuration } from '../config/configuration.js';
import { echapperLike } from '../publique/publique.service.js';
import { ErreurApi } from '../securite/erreurs.js';
import type { CompteConnecte } from '../securite/sessions.service.js';
import type { CorrectionNomDto, CreationFicheDto, FiltreComptesDto, FiltreJournalDto } from './dto.js';

/**
 * Administration générale (Partie 9c) : correction du nom, création d'une fiche, fusion, suspension,
 * lecture des comptes et du journal. Chaque écriture se fait au nom de l'administrateur (mawjoud.acteur_id) ;
 * la base vérifie l'acteur, les colonnes et les règles (032, 035). Tout est journalisé.
 */
const versFront = (s: string) => s.replaceAll('_', '-');

async function commeAdmin(tx: Executeur, admin: CompteConnecte, fusion = ''): Promise<void> {
  await tx.requete(`SELECT set_config('mawjoud.acteur_id', $1, true), set_config('mawjoud.fusion', $2, true)`, [admin.id, fusion]);
}

interface Fiche {
  id: string;
  uuid: string;
  nom: string | null;
  ville: string | null;
  statut_publication: string;
  nom_a_verifier: boolean;
  fusionnee_dans: string | null;
}

@Injectable()
export class AdministrationGeneraleService {
  constructor(
    private readonly base: BaseService,
    private readonly audit: AuditService,
    private readonly alertes: AlertesService,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  private async fiche(tx: Executeur, uuid: string, verrou = true): Promise<Fiche> {
    const [p] = await tx.requete<Fiche>(
      `SELECT id, uuid, nom, ville, statut_publication, nom_a_verifier, fusionnee_dans
         FROM annuaire.pharmacie WHERE uuid = $1 ${verrou ? 'FOR UPDATE' : ''}`, [uuid]);
    if (!p) throw new ErreurApi(404, 'introuvable');
    return p;
  }

  private async resume(ex: Executeur, id: string) {
    const [p] = await ex.requete<{ uuid: string; nom: string | null; ville: string | null; statut_publication: string;
      nom_a_verifier: boolean; conservee: string | null }>(
      `SELECT p.uuid, p.nom, p.ville, p.statut_publication, p.nom_a_verifier,
              (SELECT k.uuid FROM annuaire.pharmacie k WHERE k.id = p.fusionnee_dans) AS conservee
         FROM annuaire.pharmacie p WHERE p.id = $1`, [id]);
    return {
      id: p.uuid, nom: p.nom, ville: p.ville, statutPublication: versFront(p.statut_publication), nomARelire: p.nom_a_verifier,
      ...(p.conservee ? { fusionneeDans: p.conservee } : {}),
    };
  }

  // ---------------------------------------------------------------- 1. correction du nom

  /**
   * L'ancien et le nouveau nom vont dans le journal (ajout seul). Le nom repasse « à relire », sauf
   * confirmation (nomRelu: true) ; une fiche prête à publier ou publiée exige cette confirmation (409 sinon)
   * et reste publiée.
   */
  async corrigerNom(admin: CompteConnecte, uuid: string, dto: CorrectionNomDto) {
    return this.base.transaction(async (tx) => {
      const p = await this.fiche(tx, uuid);
      if (p.statut_publication === 'fusionnee') throw new ErreurApi(409, 'fiche-fusionnee');
      if (p.nom === dto.nom) throw new ErreurApi(409, 'meme-valeur');
      const relu = dto.nomRelu === true;
      if (!relu && ['pret_a_publier', 'publiee'].includes(p.statut_publication)) {
        throw new ErreurApi(409, 'confirmation-requise', { statut: versFront(p.statut_publication), champ: 'nomRelu' });
      }
      await commeAdmin(tx, admin);
      await tx.requete(`UPDATE annuaire.pharmacie SET nom = $2, nom_a_verifier = $3 WHERE id = $1`, [p.id, dto.nom, !relu]);
      await this.audit.ecrire(admin.id, 'corriger', 'pharmacie', uuid,
        { champ: 'nom', ancien: p.nom, nouveau: dto.nom, nomRelu: relu, statut: p.statut_publication }, tx);
      return this.resume(tx, p.id);
    });
  }

  // ---------------------------------------------------------------- 2. création d'une fiche

  /** Fiches de la même ville au nom proche (trigrammes, sans accents ni casse), hors fiches fusionnées. */
  async doublonsProbables(ex: Executeur, nom: string, ville: string) {
    const lignes = await ex.requete<{ uuid: string; nom: string; ville: string; statut_publication: string; similarite: number }>(
      `SELECT uuid, nom, ville, statut_publication,
              round(similarity(public.normaliser(nom), public.normaliser($1))::numeric, 2)::float8 AS similarite
         FROM annuaire.pharmacie
        WHERE statut_publication <> 'fusionnee' AND nom IS NOT NULL
          AND public.normaliser(ville) = public.normaliser($2)
          AND similarity(public.normaliser(nom), public.normaliser($1)) >= $3
        ORDER BY similarite DESC, uuid LIMIT 10`,
      [nom, ville, this.config.administration.seuilDoublon]);
    return lignes.map((l) => ({ id: l.uuid, nom: l.nom, ville: l.ville, statutPublication: versFront(l.statut_publication), similarite: l.similarite }));
  }

  /**
   * Crée la fiche d'une pharmacie absente de l'annuaire, pour une demande d'ajout : « en_attente_position »,
   * sans position ni publication, puis la lie à la demande (qui reste à valider par la route des rattachements).
   */
  async creerFiche(admin: CompteConnecte, dto: CreationFicheDto) {
    return this.base.transaction(async (tx) => {
      const [r] = await tx.requete<{ id: string; statut: string; pharmacie_id: string | null }>(
        `SELECT id, statut, pharmacie_id FROM prive.rattachement_pharmacien WHERE uuid = $1 FOR UPDATE`, [dto.rattachementId]);
      if (!r) throw new ErreurApi(404, 'introuvable', { champs: ['rattachementId'] });
      if (r.statut !== 'en_attente') throw new ErreurApi(409, 'deja-decidee', { etat: versFront(r.statut) });
      if (r.pharmacie_id !== null) throw new ErreurApi(409, 'pas-une-demande-d-ajout');
      const [g] = await tx.requete(`SELECT 1 FROM annuaire.gouvernorat WHERE code = $1`, [dto.gouvernorat]);
      if (!g) throw new ErreurApi(400, 'donnees-invalides', { champs: ['gouvernorat'] });
      const doublons = await this.doublonsProbables(tx, dto.nom, dto.ville);
      if (doublons.length && !dto.confirmerSansDoublon) throw new ErreurApi(409, 'doublons-probables', { pharmacies: doublons });
      await commeAdmin(tx, admin);
      const [p] = await tx.requete<{ id: string; uuid: string }>(
        `INSERT INTO annuaire.pharmacie (nom, rue, quartier, ville, code_postal, gouvernorat_code, telephone_principal, sources)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '{saisie_admin}') RETURNING id, uuid`,
        [dto.nom, dto.rue ?? null, dto.quartier ?? null, dto.ville, dto.codePostal ?? null, dto.gouvernorat, dto.telephone ?? null]);
      await tx.requete(`UPDATE prive.rattachement_pharmacien SET pharmacie_id = $2 WHERE id = $1`, [r.id, p.id]);
      await this.audit.ecrire(admin.id, 'creer_fiche', 'pharmacie', p.uuid, {
        rattachement: dto.rattachementId, doublonsSignales: doublons.map((d) => d.id), confirmeSansDoublon: dto.confirmerSansDoublon === true,
      }, tx);
      return { pharmacie: await this.resume(tx, p.id), rattachementId: dto.rattachementId };
    });
  }

  // ---------------------------------------------------------------- 3. fusion

  /**
   * Fusionne F (fusionnée) dans K (conservée), en une seule transaction. L'historique reste sur F, avec le
   * renvoi fusionnee_dans = K ; le vivant passe à K. Détail et rattrapage manuel : docs/API_ADMIN.md.
   */
  async fusionner(admin: CompteConnecte, conserveeUuid: string, fusionneeUuid: string, motif: string) {
    if (conserveeUuid.toLowerCase() === fusionneeUuid.toLowerCase()) throw new ErreurApi(409, 'meme-fiche');
    const bilan = await this.base.transaction(async (tx) => {
      // Verrous toujours dans le même ordre (identifiant croissant) : pas d'interblocage entre deux fusions.
      const deux = await tx.requete<Fiche>(
        `SELECT id, uuid, nom, ville, statut_publication, nom_a_verifier, fusionnee_dans
           FROM annuaire.pharmacie WHERE uuid = ANY($1::uuid[]) ORDER BY id FOR UPDATE`, [[conserveeUuid, fusionneeUuid]]);
      const K = deux.find((p) => p.uuid === conserveeUuid.toLowerCase());
      const F = deux.find((p) => p.uuid === fusionneeUuid.toLowerCase());
      if (!K || !F) throw new ErreurApi(404, 'introuvable');
      if (K.statut_publication === 'fusionnee' || F.statut_publication === 'fusionnee') {
        throw new ErreurApi(409, 'deja-fusionnee', { fiche: K.statut_publication === 'fusionnee' ? K.uuid : F.uuid });
      }
      await commeAdmin(tx, admin, F.id);

      // (c) Disponibilités : la déclaration la plus récente l'emporte ; copie avec date et déclarant d'origine.
      // Conflits où K l'emporte : comptés avant la copie.
      const [{ gardees }] = await tx.requete<{ gardees: number }>(
        `SELECT count(*)::int AS gardees FROM annuaire.stock f JOIN annuaire.stock k ON k.medicament_id = f.medicament_id AND k.pharmacie_id = $2
          WHERE f.pharmacie_id = $1 AND f.statut IS NOT NULL AND k.statut IS NOT NULL AND k.declare_le >= f.declare_le`, [F.id, K.id]);
      // Valeur de K avant la fusion, pour chaque médicament que F pourrait remplacer (rattrapage manuel).
      const avantK = await tx.requete<{ medicament: string; statut: string | null; declare_le: Date | null; declare_par: string | null }>(
        `SELECT m.uuid AS medicament, k.statut, k.declare_le, k.declare_par
           FROM annuaire.stock k JOIN annuaire.medicament m ON m.id = k.medicament_id
          WHERE k.pharmacie_id = $2
            AND k.medicament_id IN (SELECT medicament_id FROM annuaire.stock WHERE pharmacie_id = $1 AND statut IS NOT NULL)`, [F.id, K.id]);
      const copies = await tx.requete<{ conflit: boolean; medicament: string }>(
        `WITH f AS (SELECT * FROM annuaire.stock WHERE pharmacie_id = $1 AND statut IS NOT NULL AND declare_par IS NOT NULL),
              k AS (SELECT * FROM annuaire.stock WHERE pharmacie_id = $2)
         INSERT INTO annuaire.stock (pharmacie_id, medicament_id, statut, declare_le, declare_par)
         SELECT $2, f.medicament_id, f.statut, f.declare_le, f.declare_par
           FROM f LEFT JOIN k ON k.medicament_id = f.medicament_id
          WHERE k.medicament_id IS NULL OR k.statut IS NULL OR k.declare_le < f.declare_le
         ON CONFLICT (pharmacie_id, medicament_id)
         DO UPDATE SET statut = EXCLUDED.statut, declare_le = EXCLUDED.declare_le, declare_par = EXCLUDED.declare_par
         RETURNING (xmax <> 0) AS conflit, (SELECT uuid FROM annuaire.medicament WHERE id = medicament_id) AS medicament`, [F.id, K.id]);
      const [{ sansDeclarant }] = await tx.requete<{ sansDeclarant: number }>(
        `SELECT count(*)::int AS "sansDeclarant" FROM annuaire.stock WHERE pharmacie_id = $1 AND statut IS NOT NULL AND declare_par IS NULL`, [F.id]);
      const suivis = await tx.requete<{ medicament: string }>(
        `INSERT INTO annuaire.stock (pharmacie_id, medicament_id)
         SELECT $2, medicament_id FROM annuaire.stock WHERE pharmacie_id = $1 AND statut IS NULL
         ON CONFLICT DO NOTHING RETURNING (SELECT uuid FROM annuaire.medicament WHERE id = medicament_id) AS medicament`, [F.id, K.id]);

      // Horaires de F si K n'en a pas.
      const horaires = await tx.requete(
        `INSERT INTO annuaire.horaire (pharmacie_id, jour, ouverture, fermeture)
         SELECT $2, jour, ouverture, fermeture FROM annuaire.horaire
          WHERE pharmacie_id = $1 AND NOT EXISTS (SELECT 1 FROM annuaire.horaire WHERE pharmacie_id = $2)
         RETURNING id`, [F.id, K.id]);

      // Signalements et messages : ils portent sur la pharmacie réelle, donc sur K.
      type Ligne = { uuid: string };
      const signalements = await tx.requete<Ligne>(`UPDATE prive.signalement SET pharmacie_id = $2 WHERE pharmacie_id = $1 RETURNING uuid`, [F.id, K.id]);
      const messages = await tx.requete<Ligne>(`UPDATE prive.message_contact SET pharmacie_id = $2 WHERE pharmacie_id = $1 RETURNING uuid`, [F.id, K.id]);

      // Demande de position en attente sur F : « remplacee » (les demandes restent sur F, en ajout seul).
      const demandes = await tx.requete<Ligne>(
        `UPDATE prive.demande_position SET statut = 'remplacee', decide_par = $2, decide_le = now()
          WHERE pharmacie_id = $1 AND statut = 'en_attente' RETURNING uuid`, [F.id, admin.id]);

      // Rattachements : le validé de F passe à K si K n'en a pas, sinon il est retiré ; les demandes en attente passent à K.
      const [kValide] = await tx.requete(`SELECT 1 FROM prive.rattachement_pharmacien WHERE pharmacie_id = $1 AND statut = 'validee'`, [K.id]);
      const deplaces = kValide ? [] : await tx.requete<Ligne>(
        `UPDATE prive.rattachement_pharmacien SET pharmacie_id = $2 WHERE pharmacie_id = $1 AND statut = 'validee' RETURNING uuid`, [F.id, K.id]);
      const retires = await tx.requete<Ligne>(
        `UPDATE prive.rattachement_pharmacien
            SET statut = 'retiree', motif_code = 'pharmacie_attribuee', motif_precision = 'Fiche fusionnée avec une autre fiche.',
                decide_par = $2, decide_le = now()
          WHERE pharmacie_id = $1 AND statut = 'validee' RETURNING uuid`, [F.id, admin.id]);
      const enAttente = await tx.requete<Ligne>(
        `UPDATE prive.rattachement_pharmacien r
            SET pharmacie_id = $2,
                conflit = EXISTS (SELECT 1 FROM prive.rattachement_pharmacien x WHERE x.pharmacie_id = $2 AND x.statut IN ('validee', 'en_attente'))
          WHERE r.pharmacie_id = $1 AND r.statut = 'en_attente' RETURNING r.uuid`, [F.id, K.id]);

      // (a) F devient « fusionnee », avec le renvoi vers K.
      await tx.requete(`UPDATE annuaire.pharmacie SET statut_publication = 'fusionnee', fusionnee_dans = $2 WHERE id = $1`, [F.id, K.id]);

      const detail = {
        conservee: K.uuid, fusionnee: F.uuid, motif, statutAvant: F.statut_publication,
        disponibilitesCopiees: copies.length, conflitsResolusParF: copies.filter((c) => c.conflit).length,
        conflitsGardesSurK: gardees, nonCopieesSansDeclarant: sansDeclarant, suivisCopies: suivis.length,
        horairesCopies: horaires.length, signalementsDeplaces: signalements.length, messagesDeplaces: messages.length,
        demandesPositionRemplacees: demandes.length, rattachementsDeplaces: deplaces.length + enAttente.length,
        rattachementsRetires: retires.length,
        // Pour un rattrapage manuel (docs/API_ADMIN.md) : ce qui a été copié ou déplacé, et la valeur de K remplacée.
        rattrapage: {
          disponibilites: copies.map((c) => {
            const k = avantK.find((a) => a.medicament === c.medicament);
            return { medicament: c.medicament, avantSurK: k?.statut ? { statut: k.statut, declareLe: k.declare_le!.toISOString(), declarePar: k.declare_par } : null };
          }),
          suivis: suivis.map((s) => s.medicament),
          horairesCopies: horaires.length > 0,
          signalements: signalements.map((s) => s.uuid),
          messages: messages.map((m) => m.uuid),
          demandesPositionRemplacees: demandes.map((d) => d.uuid),
          rattachementsDeplaces: [...deplaces, ...enAttente].map((r) => r.uuid),
          rattachementsRetires: retires.map((r) => r.uuid),
        },
      };
      await this.audit.ecrire(admin.id, 'fusionner', 'pharmacie', F.uuid, detail, tx);
      await this.audit.ecrire(admin.id, 'fusionner', 'pharmacie', K.uuid, detail, tx);
      return { detail, kId: K.id, conservee: await this.resume(tx, K.id), fusionnee: await this.resume(tx, F.id) };
    });
    await this.alertes.declencher(bilan.kId);
    return { conservee: bilan.conservee, fusionnee: bilan.fusionnee, bilan: bilan.detail };
  }

  // ---------------------------------------------------------------- 4. suspension

  /**
   * Suspend un compte : sessions fermées tout de suite, aucune donnée supprimée. Il peut se reconnecter et voir
   * son état, sans pouvoir agir. Pas soi-même ; jamais le dernier administrateur actif.
   */
  async suspendre(admin: CompteConnecte, uuid: string, motif: string) {
    return this.base.transaction(async (tx) => {
      // Un changement de suspension à la fois (règle du dernier administrateur sûre même en parallèle).
      await tx.requete(`SELECT pg_advisory_xact_lock(hashtext('mawjoud:suspension'))`);
      const [u] = await tx.requete<{ id: string; role: string; suspendu: boolean }>(
        `SELECT id, role, suspendu FROM prive.utilisateur WHERE uuid = $1 FOR UPDATE`, [uuid]);
      if (!u) throw new ErreurApi(404, 'introuvable');
      if (u.id === admin.id) throw new ErreurApi(409, 'soi-meme');
      if (u.suspendu) throw new ErreurApi(409, 'deja-suspendu');
      if (u.role === 'administrateur') {
        const [{ n }] = await tx.requete<{ n: number }>(
          `SELECT count(*)::int AS n FROM prive.utilisateur WHERE role = 'administrateur' AND NOT suspendu AND id <> $1`, [u.id]);
        if (n === 0) throw new ErreurApi(409, 'dernier-administrateur');
      }
      // L'administrateur qui agit a pu être suspendu entre-temps (deux suspensions croisées) : vérifié sous le verrou.
      const [moi] = await tx.requete<{ suspendu: boolean }>(`SELECT suspendu FROM prive.utilisateur WHERE id = $1`, [admin.id]);
      if (!moi || moi.suspendu) throw new ErreurApi(403, 'compte-suspendu');
      await tx.requete(`UPDATE prive.utilisateur SET suspendu = true WHERE id = $1`, [u.id]);
      const sessions = await tx.requete(`DELETE FROM prive.session WHERE utilisateur_id = $1 RETURNING utilisateur_id`, [u.id]);
      await this.audit.ecrire(admin.id, 'suspendre', 'utilisateur', uuid, { role: u.role, motif, sessionsFermees: sessions.length }, tx);
      return { id: uuid, suspendu: true, sessionsFermees: sessions.length };
    });
  }

  async retablir(admin: CompteConnecte, uuid: string, motif: string) {
    return this.base.transaction(async (tx) => {
      await tx.requete(`SELECT pg_advisory_xact_lock(hashtext('mawjoud:suspension'))`);
      const [u] = await tx.requete<{ id: string; role: string; suspendu: boolean }>(
        `SELECT id, role, suspendu FROM prive.utilisateur WHERE uuid = $1 FOR UPDATE`, [uuid]);
      if (!u) throw new ErreurApi(404, 'introuvable');
      if (!u.suspendu) throw new ErreurApi(409, 'pas-suspendu');
      const [moi] = await tx.requete<{ suspendu: boolean }>(`SELECT suspendu FROM prive.utilisateur WHERE id = $1`, [admin.id]);
      if (!moi || moi.suspendu) throw new ErreurApi(403, 'compte-suspendu');
      await tx.requete(`UPDATE prive.utilisateur SET suspendu = false WHERE id = $1`, [u.id]);
      await this.audit.ecrire(admin.id, 'retablir', 'utilisateur', uuid, { role: u.role, motif }, tx);
      return { id: uuid, suspendu: false };
    });
  }

  // ---------------------------------------------------------------- 5. lecture

  /** Comptes, sans empreinte de mot de passe, ni jeton, ni session. */
  async comptes(f: FiltreComptesDto) {
    const filtres = [f.role ?? null, f.statut === undefined ? null : f.statut === 'suspendu', f.email ? echapperLike(f.email.toLowerCase()) : null];
    const condition = `($1::text IS NULL OR u.role = $1) AND ($2::boolean IS NULL OR u.suspendu = $2)
      AND ($3::text IS NULL OR lower(u.email) LIKE '%' || $3 || '%' ESCAPE '\\')`;
    const [{ total }] = await this.base.requete<{ total: number }>(`SELECT count(*)::int AS total FROM prive.utilisateur u WHERE ${condition}`, filtres);
    const lignes = await this.base.requete<{ uuid: string; email: string; role: string; verifie: boolean; suspendu: boolean;
      created_at: Date; pharmacie_uuid: string | null; pharmacie_nom: string | null }>(
      `SELECT u.uuid, u.email, u.role, u.email_verifie_le IS NOT NULL AS verifie, u.suspendu, u.created_at,
              p.uuid AS pharmacie_uuid, p.nom AS pharmacie_nom
         FROM prive.utilisateur u
         LEFT JOIN prive.rattachement_pharmacien r ON r.utilisateur_id = u.id AND r.statut = 'validee'
         LEFT JOIN annuaire.pharmacie p ON p.id = r.pharmacie_id
        WHERE ${condition}
        ORDER BY u.created_at DESC, u.uuid LIMIT $4 OFFSET $5`,
      [...filtres, f.taille, (f.page - 1) * f.taille]);
    return {
      elements: lignes.map((l) => ({
        id: l.uuid, email: l.email, role: l.role, emailVerifie: l.verifie, suspendu: l.suspendu, creeLe: l.created_at.toISOString(),
        pharmacie: l.pharmacie_uuid ? { id: l.pharmacie_uuid, nom: l.pharmacie_nom } : null,
      })),
      page: f.page, taille: f.taille, total,
    };
  }

  /** Journal d'audit en lecture seule (la table refuse toute modification), du plus récent au plus ancien. */
  async journal(f: FiltreJournalDto) {
    const filtres = [f.action ?? null, f.cibleType ?? null, f.cibleId ?? null, f.acteur ?? null, f.depuis ?? null, f.jusqua ?? null];
    const condition = `($1::text IS NULL OR j.action = $1) AND ($2::text IS NULL OR j.cible_type = $2) AND ($3::text IS NULL OR j.cible_id = $3)
      AND ($4::uuid IS NULL OR j.acteur_id = (SELECT id FROM prive.utilisateur WHERE uuid = $4))
      AND ($5::timestamptz IS NULL OR j.created_at >= $5) AND ($6::timestamptz IS NULL OR j.created_at < $6::timestamptz + interval '1 day')`;
    const [{ total }] = await this.base.requete<{ total: number }>(`SELECT count(*)::int AS total FROM prive.journal_audit j WHERE ${condition}`, filtres);
    const lignes = await this.base.requete<{ id: string; action: string; cible_type: string; cible_id: string; detail: unknown;
      created_at: Date; acteur_uuid: string | null; acteur_email: string | null; acteur_id: string | null }>(
      `SELECT j.id, j.action, j.cible_type, j.cible_id, j.detail, j.created_at, j.acteur_id, u.uuid AS acteur_uuid, u.email AS acteur_email
         FROM prive.journal_audit j LEFT JOIN prive.utilisateur u ON u.id = j.acteur_id
        WHERE ${condition}
        ORDER BY j.created_at DESC, j.id DESC LIMIT $7 OFFSET $8`,
      [...filtres, f.taille, (f.page - 1) * f.taille]);
    return {
      elements: lignes.map((l) => ({
        id: l.id, action: l.action, cibleType: l.cible_type, cibleId: l.cible_id, detail: l.detail, creeLe: l.created_at.toISOString(),
        // Compte supprimé depuis : l'action reste, sans identité.
        acteur: l.acteur_uuid ? { id: l.acteur_uuid, email: l.acteur_email } : l.acteur_id ? { id: null, email: null, supprime: true } : null,
      })),
      page: f.page, taille: f.taille, total,
    };
  }
}
