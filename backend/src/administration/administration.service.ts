import { Inject, Injectable } from '@nestjs/common';
import { AlertesService } from '../alertes/alertes.service.js';
import { AuditService } from '../audit/audit.service.js';
import { BaseService, type Executeur } from '../base/base.service.js';
import { distanceMetresSql } from '../commun/geo.js';
import { CONFIGURATION } from '../config/jetons-injection.js';
import type { Configuration } from '../config/configuration.js';
import { ErreurApi } from '../securite/erreurs.js';
import type { CompteConnecte } from '../securite/sessions.service.js';
import {
  STATUTS_PUBLICATION,
  type ChangementStatutDto,
  type FiltreDemandesPositionDto,
  type FiltrePharmaciesAdminDto,
  type StatutPublicationFront,
} from './dto.js';

/**
 * Administration (Partie 8) : demandes de position et cycle de publication.
 * Chaque écriture se fait au nom de l'administrateur (mawjoud.acteur_id) : la base vérifie l'acteur, les
 * transitions (032) et les conditions de publication (contrainte pharmacie_publique_complete).
 * Chaque décision est journalisée avec l'ancienne et la nouvelle valeur.
 */
const versBase = (s: string) => s.replaceAll('-', '_');
const versFront = (s: string) => s.replaceAll('_', '-');

/** Motifs qui empêchent la publication (pret_a_publier, publiee), calculés en SQL sur la fiche p. */
const MOTIFS = `array_remove(ARRAY[
    CASE WHEN p.latitude IS NULL THEN 'position-manquante' END,
    CASE WHEN p.latitude IS NOT NULL AND NOT p.position_confirmee THEN 'position-non-confirmee' END,
    CASE WHEN p.nom IS NULL THEN 'nom-manquant' END,
    CASE WHEN p.nom_a_verifier THEN 'nom-non-relu' END,
    CASE WHEN p.ville IS NULL THEN 'ville-manquante' END,
    CASE WHEN p.gouvernorat_code IS NULL THEN 'gouvernorat-manquant' END
  ], NULL)`;

interface Fiche {
  id: string;
  uuid: string;
  nom: string | null;
  ville: string | null;
  gouvernorat_code: number | null;
  latitude: number | null;
  longitude: number | null;
  position_confirmee: boolean;
  statut_publication: string;
  nom_a_verifier: boolean;
  motifs: string[];
}

async function commeAdmin(tx: Executeur, admin: CompteConnecte, motifPosition = '', demandeId = ''): Promise<void> {
  await tx.requete(
    `SELECT set_config('mawjoud.acteur_id', $1, true), set_config('mawjoud.motif_position', $2, true),
            set_config('mawjoud.demande_position_id', $3, true)`,
    [admin.id, motifPosition, demandeId]);
}

@Injectable()
export class AdministrationService {
  constructor(
    private readonly base: BaseService,
    private readonly audit: AuditService,
    private readonly alertes: AlertesService,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  // ---------------------------------------------------------------- demandes de position

  async demandesPosition(f: FiltreDemandesPositionDto) {
    const filtre = [f.gouvernorat ?? null];
    const [{ total }] = await this.base.requete<{ total: number }>(
      `SELECT count(*)::int AS total FROM prive.demande_position d JOIN annuaire.pharmacie p ON p.id = d.pharmacie_id
        WHERE d.statut = 'en_attente' AND ($1::smallint IS NULL OR p.gouvernorat_code = $1)`, filtre);
    const lignes = await this.base.requete<{
      uuid: string; latitude: number; longitude: number; commentaire: string | null; created_at: Date;
      pharmacie_uuid: string; nom: string | null; ville: string | null; gouvernorat_code: number | null; gouvernorat: string | null;
      statut_publication: string; lat_actuelle: number | null; lng_actuelle: number | null; confirmee: boolean;
      distance: number | null; demandeur_uuid: string | null; demandeur_email: string | null;
      proches: { id: string; nom: string; distanceM: number }[] | null;
    }>(
      `SELECT d.uuid, d.latitude, d.longitude, d.commentaire, d.created_at,
              p.uuid AS pharmacie_uuid, p.nom, p.ville, p.gouvernorat_code, g.nom AS gouvernorat, p.statut_publication,
              p.latitude AS lat_actuelle, p.longitude AS lng_actuelle, p.position_confirmee AS confirmee,
              CASE WHEN p.latitude IS NULL THEN NULL
                   ELSE ${distanceMetresSql('d.latitude', 'd.longitude', 'p.latitude', 'p.longitude')} END AS distance,
              u.uuid AS demandeur_uuid, u.email AS demandeur_email,
              (SELECT json_agg(json_build_object('id', x.uuid, 'nom', x.nom, 'distanceM', round(x.distance::numeric, 1)) ORDER BY x.distance)
                 FROM (SELECT o.uuid, o.nom, ${distanceMetresSql('d.latitude', 'd.longitude', 'o.latitude', 'o.longitude')} AS distance
                         FROM annuaire.pharmacie o
                        WHERE o.statut_publication = 'publiee' AND o.id <> p.id
                          AND o.latitude BETWEEN d.latitude - 0.0005 AND d.latitude + 0.0005
                          AND o.longitude BETWEEN d.longitude - 0.0006 AND d.longitude + 0.0006) x
                WHERE x.distance <= $4) AS proches
         FROM prive.demande_position d
         JOIN annuaire.pharmacie p ON p.id = d.pharmacie_id
         LEFT JOIN annuaire.gouvernorat g ON g.code = p.gouvernorat_code
         LEFT JOIN prive.utilisateur u ON u.id = d.demandeur_id
        WHERE d.statut = 'en_attente' AND ($1::smallint IS NULL OR p.gouvernorat_code = $1)
        ORDER BY d.created_at, d.id
        LIMIT $2 OFFSET $3`,
      [...filtre, f.taille, (f.page - 1) * f.taille, this.config.positions.rayonProximiteM]);
    return {
      elements: lignes.map((l) => ({
        id: l.uuid,
        pharmacie: {
          id: l.pharmacie_uuid, nom: l.nom, ville: l.ville, statutPublication: versFront(l.statut_publication),
          gouvernorat: l.gouvernorat_code === null ? null : { code: l.gouvernorat_code, nom: l.gouvernorat },
        },
        proposee: { latitude: l.latitude, longitude: l.longitude },
        actuelle: l.lat_actuelle === null ? null : { latitude: l.lat_actuelle, longitude: l.lng_actuelle, confirmee: l.confirmee },
        distanceM: l.distance === null ? null : Math.round(Number(l.distance) * 10) / 10,
        pharmaciesProches: l.proches ?? [],
        commentaire: l.commentaire,
        demandeur: l.demandeur_uuid ? { id: l.demandeur_uuid, email: l.demandeur_email } : null,
        creeeLe: l.created_at.toISOString(),
      })),
      page: f.page, taille: f.taille, total,
    };
  }

  /** Verrouille une demande en attente et sa pharmacie ; 404 si absente, 409 si déjà décidée. */
  private async demandeEnAttente(tx: Executeur, uuid: string) {
    const [d] = await tx.requete<{ id: string; statut: string; latitude: number; longitude: number; pharmacie_id: string; pharmacie_uuid: string }>(
      `SELECT d.id, d.statut, d.latitude, d.longitude, d.pharmacie_id, p.uuid AS pharmacie_uuid
         FROM prive.demande_position d JOIN annuaire.pharmacie p ON p.id = d.pharmacie_id
        WHERE d.uuid = $1 FOR UPDATE OF d, p`, [uuid]);
    if (!d) throw new ErreurApi(404, 'introuvable');
    if (d.statut !== 'en_attente') throw new ErreurApi(409, 'deja-decidee', { etat: versFront(d.statut) });
    return d;
  }

  /**
   * Applique la position (confirmée, source « saisie_pharmacien », précision « exact ») et fait avancer
   * une fiche en attente de position : nom à relire → a_relire ; fiche complète → pret_a_publier ;
   * sinon elle reste en attente (motifs visibles dans la liste). Jamais « publiee » directement.
   */
  async validerPosition(admin: CompteConnecte, uuid: string) {
    return this.base.transaction(async (tx) => {
      const d = await this.demandeEnAttente(tx, uuid);
      const [avant] = await tx.requete<Fiche>(
        `SELECT p.id, p.uuid, p.nom, p.ville, p.gouvernorat_code, p.latitude, p.longitude, p.position_confirmee,
                p.statut_publication, p.nom_a_verifier, ${MOTIFS} AS motifs
           FROM annuaire.pharmacie p WHERE p.id = $1`, [d.pharmacie_id]);
      if (['non_publiable', 'fermee', 'fusionnee'].includes(avant.statut_publication)) {
        throw new ErreurApi(409, 'statut-incompatible', { statut: versFront(avant.statut_publication) });
      }
      let statutApres = avant.statut_publication;
      if (avant.statut_publication === 'en_attente_position') {
        if (avant.nom_a_verifier) statutApres = 'a_relire';
        else if (avant.nom !== null && avant.ville !== null && avant.gouvernorat_code !== null) statutApres = 'pret_a_publier';
      }
      await commeAdmin(tx, admin, `validation de la demande de position ${uuid}`, d.id);
      await tx.requete(
        `UPDATE annuaire.pharmacie
            SET latitude = $2, longitude = $3, position_confirmee = true, source_gps = 'saisie_pharmacien',
                precision_gps = 'exact', statut_publication = $4
          WHERE id = $1`,
        [d.pharmacie_id, d.latitude, d.longitude, statutApres]);
      await tx.requete(
        `UPDATE prive.demande_position SET statut = 'validee', decide_par = $2, decide_le = now() WHERE id = $1`, [d.id, admin.id]);
      await this.audit.ecrire(admin.id, 'valider_position', 'demande_position', uuid, {
        pharmacie: d.pharmacie_uuid,
        ancienne: avant.latitude === null ? null : { latitude: avant.latitude, longitude: avant.longitude!, confirmee: avant.position_confirmee },
        nouvelle: { latitude: d.latitude, longitude: d.longitude, confirmee: true },
        statutAvant: avant.statut_publication,
        statutApres,
      }, tx);
      return this.fiche(tx, d.pharmacie_id);
    });
  }

  async refuserPosition(admin: CompteConnecte, uuid: string, motif: string) {
    return this.base.transaction(async (tx) => {
      const d = await this.demandeEnAttente(tx, uuid);
      await tx.requete(
        `UPDATE prive.demande_position SET statut = 'refusee', motif_refus = $2, decide_par = $3, decide_le = now() WHERE id = $1`,
        [d.id, motif, admin.id]);
      await this.audit.ecrire(admin.id, 'refuser_position', 'demande_position', uuid, {
        pharmacie: d.pharmacie_uuid, proposee: { latitude: d.latitude, longitude: d.longitude }, motif,
      }, tx);
      return { id: uuid, etat: 'refusee', motifRefus: motif };
    });
  }

  // ---------------------------------------------------------------- pharmacies et publication

  async pharmacies(f: FiltrePharmaciesAdminDto) {
    const filtres = [f.statut ? versBase(f.statut) : null, f.gouvernorat ?? null, f.ville ?? null];
    const condition = `($1::text IS NULL OR p.statut_publication = $1)
      AND ($2::smallint IS NULL OR p.gouvernorat_code = $2)
      AND ($3::text IS NULL OR public.normaliser(p.ville) = public.normaliser($3))`;
    const [{ total }] = await this.base.requete<{ total: number }>(
      `SELECT count(*)::int AS total FROM annuaire.pharmacie p WHERE ${condition}`, filtres);
    const lignes = await this.base.requete<Fiche & { demande_en_attente: boolean }>(
      `SELECT p.id, p.uuid, p.nom, p.ville, p.gouvernorat_code, p.latitude, p.longitude, p.position_confirmee,
              p.statut_publication, p.nom_a_verifier, ${MOTIFS} AS motifs,
              EXISTS (SELECT 1 FROM prive.demande_position d WHERE d.pharmacie_id = p.id AND d.statut = 'en_attente') AS demande_en_attente
         FROM annuaire.pharmacie p WHERE ${condition}
        ORDER BY p.nom NULLS LAST, p.uuid
        LIMIT $4 OFFSET $5`,
      [...filtres, f.taille, (f.page - 1) * f.taille]);
    return {
      elements: lignes.map((l) => ({ ...this.forme(l), demandePositionEnAttente: l.demande_en_attente })),
      page: f.page, taille: f.taille, total,
    };
  }

  /** Marque le nom comme relu (fiches dont le nom était un nom de personne). Le statut ne change pas. */
  async relire(admin: CompteConnecte, uuid: string) {
    return this.base.transaction(async (tx) => {
      const p = await this.ficheVerrouillee(tx, uuid);
      if (p.statut_publication === 'fusionnee') throw new ErreurApi(409, 'fiche-fusionnee');
      if (p.nom === null) throw new ErreurApi(409, 'conditions-non-remplies', { motifs: ['nom-manquant'] });
      if (!p.nom_a_verifier) throw new ErreurApi(409, 'deja-relu');
      await commeAdmin(tx, admin);
      await tx.requete(`UPDATE annuaire.pharmacie SET nom_a_verifier = false WHERE id = $1`, [p.id]);
      await this.audit.ecrire(admin.id, 'relire_nom', 'pharmacie', uuid, { nom: p.nom, ancien: true, nouveau: false }, tx);
      return this.fiche(tx, p.id);
    });
  }

  /**
   * Change le statut selon la liste blanche de la base (annuaire.transition_publication_autorisee).
   * 409 expliqué si la transition est interdite ou si la fiche ne remplit pas les conditions de publication ;
   * la base refuserait de toute façon (déclencheur 032, contrainte pharmacie_publique_complete).
   */
  async changerStatut(admin: CompteConnecte, uuid: string, dto: ChangementStatutDto) {
    const vers = versBase(dto.statut);
    const fiche = await this.base.transaction(async (tx) => {
      const p = await this.ficheVerrouillee(tx, uuid);
      const de = p.statut_publication;
      if (de === vers) throw new ErreurApi(409, 'meme-statut', { statut: dto.statut });
      const [{ autorisee }] = await tx.requete<{ autorisee: boolean }>(
        `SELECT annuaire.transition_publication_autorisee($1, $2) AS autorisee`, [de, vers]);
      if (!autorisee) {
        const possibles = await tx.requete<{ s: string }>(
          `SELECT s FROM unnest($2::text[]) s WHERE annuaire.transition_publication_autorisee($1, s)`,
          [de, STATUTS_PUBLICATION.map(versBase)]);
        throw new ErreurApi(409, 'transition-interdite', {
          de: versFront(de), vers: dto.statut, autorisees: possibles.map((x) => versFront(x.s)),
        });
      }
      if ((vers === 'pret_a_publier' || vers === 'publiee') && p.motifs.length) {
        throw new ErreurApi(409, 'conditions-non-remplies', { motifs: p.motifs });
      }
      await commeAdmin(tx, admin);
      await tx.requete(`UPDATE annuaire.pharmacie SET statut_publication = $2 WHERE id = $1`, [p.id, vers]);
      await this.audit.ecrire(admin.id, 'changer_statut', 'pharmacie', uuid,
        { de: versFront(de), vers: dto.statut, motif: dto.motif ?? null }, tx);
      return { forme: await this.fiche(tx, p.id), id: p.id };
    });
    // Une pharmacie qui devient publique peut satisfaire des alertes en attente (disponibilités déjà déclarées).
    if (vers === 'publiee') await this.alertes.declencher(fiche.id);
    return fiche.forme;
  }

  private async ficheVerrouillee(tx: Executeur, uuid: string): Promise<Fiche> {
    const [p] = await tx.requete<Fiche>(
      `SELECT p.id, p.uuid, p.nom, p.ville, p.gouvernorat_code, p.latitude, p.longitude, p.position_confirmee,
              p.statut_publication, p.nom_a_verifier, ${MOTIFS} AS motifs
         FROM annuaire.pharmacie p WHERE p.uuid = $1 FOR UPDATE`, [uuid]);
    if (!p) throw new ErreurApi(404, 'introuvable');
    return p;
  }

  private async fiche(ex: Executeur, id: string) {
    const [p] = await ex.requete<Fiche>(
      `SELECT p.id, p.uuid, p.nom, p.ville, p.gouvernorat_code, p.latitude, p.longitude, p.position_confirmee,
              p.statut_publication, p.nom_a_verifier, ${MOTIFS} AS motifs
         FROM annuaire.pharmacie p WHERE p.id = $1`, [id]);
    return this.forme(p);
  }

  private forme(p: Fiche) {
    return {
      id: p.uuid,
      nom: p.nom,
      ville: p.ville,
      gouvernorat: p.gouvernorat_code,
      statutPublication: versFront(p.statut_publication) as StatutPublicationFront,
      position: p.latitude === null ? null : { latitude: p.latitude, longitude: p.longitude, confirmee: p.position_confirmee },
      nomARelire: p.nom_a_verifier,
      // Ce qui empêche la publication (vide : la fiche peut être publiée).
      motifsBlocage: p.motifs,
    };
  }
}
