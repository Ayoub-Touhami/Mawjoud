import { Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { BaseService } from '../base/base.service.js';
import { ErreurApi } from '../securite/erreurs.js';
import type { CompteConnecte } from '../securite/sessions.service.js';
import type { DemandeRattachementDto, RefusDto } from './dto.js';

/** Base en snake_case, front-end avec des tirets (docs/MODELE_DONNEES.md). */
const versFront = (v: string | null) => (v === null ? undefined : v.replaceAll('_', '-'));
const versBase = (v: string) => v.replaceAll('-', '_');

/** Statuts de l'annuaire qu'un pharmacien peut réclamer (pas une fiche fermée, fusionnée ou sans nom). */
const STATUTS_RECLAMABLES = ['en_attente_position', 'a_relire', 'pret_a_publier', 'publiee'];

interface LigneDemande {
  uuid: string;
  pharmacie_uuid: string | null;
  pharmacien_uuid: string;
  pharmacien_email?: string;
  pharmacie_nom?: string | null;
  statut: string;
  created_at: Date;
  motif_code: string | null;
  motif_precision: string | null;
  conflit: boolean;
  ajout_nom: string | null;
  ajout_adresse: string | null;
  ajout_ville: string | null;
  ajout_telephone: string | null;
  justificatif_texte: string | null;
  justificatif_fichier_nom: string | null;
  justificatif_fichier_taille: number | null;
}

const SELECT_DEMANDE = `
  SELECT r.uuid, p.uuid AS pharmacie_uuid, u.uuid AS pharmacien_uuid, u.email AS pharmacien_email, p.nom AS pharmacie_nom,
         r.statut, r.created_at, r.motif_code, r.motif_precision, r.conflit,
         r.ajout_nom, r.ajout_adresse, r.ajout_ville, r.ajout_telephone,
         r.justificatif_texte, r.justificatif_fichier_nom, r.justificatif_fichier_taille
    FROM prive.rattachement_pharmacien r
    JOIN prive.utilisateur u ON u.id = r.utilisateur_id
    LEFT JOIN annuaire.pharmacie p ON p.id = r.pharmacie_id`;

/** Forme DemandeReclamation du front-end. */
function demande(l: LigneDemande, pourAdministrateur = false) {
  return {
    id: l.uuid,
    pharmacieId: l.pharmacie_uuid,
    pharmacienId: l.pharmacien_uuid,
    etat: versFront(l.statut),
    creeeLe: l.created_at.toISOString(),
    ...(l.motif_code ? { motifCode: versFront(l.motif_code) } : {}),
    ...(l.motif_precision ? { motifPrecision: l.motif_precision } : {}),
    ...(l.conflit ? { conflit: true } : {}),
    ...(l.ajout_nom
      ? { ajout: { nom: l.ajout_nom, adresse: l.ajout_adresse ?? '', ville: l.ajout_ville ?? '', telephone: l.ajout_telephone ?? '' } }
      : {}),
    ...(l.justificatif_texte || l.justificatif_fichier_nom
      ? {
          justificatif: {
            ...(l.justificatif_texte ? { texte: l.justificatif_texte } : {}),
            ...(l.justificatif_fichier_nom ? { fichier: { nom: l.justificatif_fichier_nom, taille: l.justificatif_fichier_taille } } : {}),
          },
        }
      : {}),
    ...(pourAdministrateur ? { pharmacienEmail: l.pharmacien_email, pharmacieNom: l.pharmacie_nom ?? null } : {}),
  };
}

@Injectable()
export class RattachementsService {
  constructor(
    private readonly base: BaseService,
    private readonly audit: AuditService,
  ) {}

  /** Dernière demande du pharmacien connecté, ou null. */
  /**
   * Fiches réclamables (Partie 9e), par nom, ville ou rue, sans accents ni casse. Les fiches dont le nom est
   * « à relire » (souvent un nom de personne) ne sont jamais proposées. 20 au plus.
   */
  async rechercherFiches(q: string) {
    const lignes = await this.base.requete<{ uuid: string; nom: string; rue: string | null; ville: string | null; code_postal: string | null; gouvernorat: string | null; latitude: number | null; longitude: number | null; telephone_principal: string | null; etat: string }>(
      `SELECT p.uuid, p.nom, p.rue, p.ville, p.code_postal, g.nom AS gouvernorat, p.latitude, p.longitude, p.telephone_principal,
              CASE WHEN EXISTS (SELECT 1 FROM prive.rattachement_pharmacien r WHERE r.pharmacie_id = p.id AND r.statut = 'validee') THEN 'inscrite'
                   WHEN EXISTS (SELECT 1 FROM prive.rattachement_pharmacien r WHERE r.pharmacie_id = p.id AND r.statut = 'en_attente') THEN 'reclamee'
                   ELSE 'non-inscrite' END AS etat
         FROM annuaire.pharmacie p LEFT JOIN annuaire.gouvernorat g ON g.code = p.gouvernorat_code
        WHERE p.statut_publication = ANY($2::text[]) AND NOT p.nom_a_verifier AND p.nom IS NOT NULL
          AND (strpos(public.normaliser(p.nom), public.normaliser($1)) > 0
               OR strpos(public.normaliser(coalesce(p.ville, '')), public.normaliser($1)) > 0
               OR strpos(public.normaliser(coalesce(p.rue, '')), public.normaliser($1)) > 0)
        ORDER BY p.nom, p.ville, p.uuid LIMIT 20`,
      [q, STATUTS_RECLAMABLES]);
    return {
      elements: lignes.map((l) => ({
        id: l.uuid, nom: l.nom, rue: l.rue, ville: l.ville, codePostal: l.code_postal, gouvernorat: l.gouvernorat,
        latitude: l.latitude, longitude: l.longitude, telephone: l.telephone_principal, etat: l.etat,
      })),
    };
  }

  async maDemande(compte: CompteConnecte) {
    const [l] = await this.base.requete<LigneDemande>(`${SELECT_DEMANDE} WHERE r.utilisateur_id = $1 ORDER BY r.created_at DESC LIMIT 1`, [
      compte.id,
    ]);
    return l ? demande(l) : null;
  }

  /**
   * Réclamation d'une pharmacie de l'annuaire, ou demande d'ajout. Une seule demande en cours par compte.
   * Pharmacie déjà réclamée ou attribuée : la demande part quand même, marquée « conflit » (F5).
   */
  async demander(compte: CompteConnecte, dto: DemandeRattachementDto) {
    if (!!dto.pharmacieId === !!dto.ajout) throw new ErreurApi(400, 'donnees-invalides', { champs: ['pharmacieId', 'ajout'] });

    const uuid = await this.base.transaction(async (tx) => {
      const etat = await tx.requete<{ statut: string }>(
        `SELECT statut FROM prive.rattachement_pharmacien WHERE utilisateur_id = $1 AND statut IN ('en_attente', 'validee')`,
        [compte.id],
      );
      if (etat.some((e) => e.statut === 'validee')) throw new ErreurApi(409, 'deja-rattache');
      if (etat.length) throw new ErreurApi(409, 'demande-en-cours');

      let pharmacieId: string | null = null;
      let conflit = false;
      if (dto.pharmacieId) {
        const [p] = await tx.requete<{ id: string }>(
          `SELECT id FROM annuaire.pharmacie WHERE uuid = $1 AND statut_publication = ANY($2::text[])`,
          [dto.pharmacieId, STATUTS_RECLAMABLES],
        );
        if (!p) throw new ErreurApi(404, 'introuvable');
        pharmacieId = p.id;
        const [c] = await tx.requete<{ n: number }>(
          `SELECT count(*)::int AS n FROM prive.rattachement_pharmacien
            WHERE pharmacie_id = $1 AND statut IN ('en_attente', 'validee')`,
          [p.id],
        );
        conflit = c.n > 0;
      }
      const j = dto.justificatif;
      const [r] = await tx.requete<{ uuid: string }>(
        `INSERT INTO prive.rattachement_pharmacien
           (utilisateur_id, pharmacie_id, ajout_nom, ajout_adresse, ajout_ville, ajout_telephone,
            justificatif_texte, justificatif_fichier_nom, justificatif_fichier_taille, conflit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING uuid`,
        [
          compte.id, pharmacieId,
          dto.ajout?.nom ?? null, dto.ajout?.adresse ?? null, dto.ajout?.ville ?? null, dto.ajout?.telephone ?? null,
          j?.texte ?? null, j?.fichier?.nom ?? null, j?.fichier?.taille ?? null, conflit,
        ],
      );
      return r.uuid;
    });
    const [l] = await this.base.requete<LigneDemande>(`${SELECT_DEMANDE} WHERE r.uuid = $1`, [uuid]);
    return demande(l);
  }

  async lister(etat = 'en-attente') {
    const lignes = await this.base.requete<LigneDemande>(`${SELECT_DEMANDE} WHERE r.statut = $1 ORDER BY r.created_at`, [versBase(etat)]);
    return lignes.map((l) => demande(l, true));
  }

  /** Valide : le compte pharmacien devient « vérifié », la pharmacie « inscrite ». Journalisé. */
  async valider(admin: CompteConnecte, uuid: string) {
    await this.base.transaction(async (tx) => {
      const [r] = await tx.requete<{ id: string; statut: string; pharmacie_id: string | null; pharmacien_uuid: string; pharmacie_uuid: string | null }>(
        `SELECT r.id, r.statut, r.pharmacie_id, u.uuid AS pharmacien_uuid, p.uuid AS pharmacie_uuid
           FROM prive.rattachement_pharmacien r
           JOIN prive.utilisateur u ON u.id = r.utilisateur_id
           LEFT JOIN annuaire.pharmacie p ON p.id = r.pharmacie_id
          WHERE r.uuid = $1 FOR UPDATE OF r`,
        [uuid],
      );
      if (!r) throw new ErreurApi(404, 'introuvable');
      if (r.statut !== 'en_attente') throw new ErreurApi(409, 'deja-decidee');
      // Demande d'ajout : la fiche doit d'abord être créée dans l'annuaire (administration, Partie 8).
      if (!r.pharmacie_id) throw new ErreurApi(409, 'pharmacie-a-creer');
      const [deja] = await tx.requete(
        `SELECT 1 FROM prive.rattachement_pharmacien WHERE pharmacie_id = $1 AND statut = 'validee'`,
        [r.pharmacie_id],
      );
      if (deja) throw new ErreurApi(409, 'pharmacie-attribuee');
      await tx.requete(
        `UPDATE prive.rattachement_pharmacien SET statut = 'validee', decide_par = $2, decide_le = now() WHERE id = $1`,
        [r.id, admin.id],
      );
      await this.audit.ecrire(admin.id, 'valider', 'rattachement', uuid, { pharmacien: r.pharmacien_uuid, pharmacie: r.pharmacie_uuid }, tx);
    });
    const [l] = await this.base.requete<LigneDemande>(`${SELECT_DEMANDE} WHERE r.uuid = $1`, [uuid]);
    return demande(l, true);
  }

  async refuser(admin: CompteConnecte, uuid: string, dto: RefusDto) {
    await this.base.transaction(async (tx) => {
      const [r] = await tx.requete<{ id: string; statut: string; pharmacien_uuid: string }>(
        `SELECT r.id, r.statut, u.uuid AS pharmacien_uuid FROM prive.rattachement_pharmacien r
           JOIN prive.utilisateur u ON u.id = r.utilisateur_id WHERE r.uuid = $1 FOR UPDATE OF r`,
        [uuid],
      );
      if (!r) throw new ErreurApi(404, 'introuvable');
      if (r.statut !== 'en_attente') throw new ErreurApi(409, 'deja-decidee');
      await tx.requete(
        `UPDATE prive.rattachement_pharmacien
            SET statut = 'refusee', motif_code = $2, motif_precision = $3, decide_par = $4, decide_le = now()
          WHERE id = $1`,
        [r.id, versBase(dto.motifCode), dto.motifPrecision ?? null, admin.id],
      );
      await this.audit.ecrire(admin.id, 'refuser', 'rattachement', uuid, { pharmacien: r.pharmacien_uuid, motif: versBase(dto.motifCode) }, tx);
    });
    const [l] = await this.base.requete<LigneDemande>(`${SELECT_DEMANDE} WHERE r.uuid = $1`, [uuid]);
    return demande(l, true);
  }
}
