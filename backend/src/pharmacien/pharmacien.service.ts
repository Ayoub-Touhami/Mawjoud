import { Inject, Injectable } from '@nestjs/common';
import { AlertesService } from '../alertes/alertes.service.js';
import { AuditService, type ValeurAudit } from '../audit/audit.service.js';
import { BaseService, type Executeur } from '../base/base.service.js';
import { echapperLike } from '../publique/publique.service.js';
import { ErreurApi } from '../securite/erreurs.js';
import type { CompteConnecte } from '../securite/sessions.service.js';
import { distanceMetresSql } from '../commun/geo.js';
import { CONFIGURATION } from '../config/jetons-injection.js';
import type { Configuration } from '../config/configuration.js';
import type { DisponibilitesDto, LotDto, ModificationFicheDto, PageDto, PlageDto, PositionDto, StatutFront } from './dto.js';

/**
 * Espace pharmacien (Partie 7). R9 : chaque route vérifie que la pharmacie appartient au compte
 * (rattachement validé). Sinon 404 « introuvable » — la même réponse qu'une pharmacie inexistante,
 * pour ne rien révéler — et la tentative est journalisée (acces_refuse).
 * La base vérifie aussi : déclarant (014), retrait (031), compte suspendu (014, 027).
 * Les déclarations n'utilisent jamais une date venue du client : declare_le = now() du serveur.
 */
const versBase = (s: StatutFront) => s.replaceAll('-', '_');
const versFront = (s: string | null) => (s === null ? null : s.replaceAll('_', '-'));

interface MaPharmacie {
  id: string; // interne
  uuid: string;
}

interface LigneDispo {
  medicament_uuid: string;
  nom_commercial: string;
  dci: string;
  forme: string | null;
  dosage: string | null;
  statut: string;
  declare_le: Date;
}

const disponibilite = (l: LigneDispo) => ({
  medicament: { id: l.medicament_uuid, nomCommercial: l.nom_commercial, dci: l.dci, forme: l.forme, dosage: l.dosage },
  statut: versFront(l.statut),
  declareLe: l.declare_le.toISOString(),
});

/** Fixe l'acteur pour les déclencheurs de la base (retrait de stock, positions). */
async function acteur(tx: Executeur, compte: CompteConnecte): Promise<void> {
  await tx.requete(`SELECT set_config('mawjoud.acteur_id', $1, true)`, [compte.id]);
}

@Injectable()
export class PharmacienService {
  constructor(
    private readonly base: BaseService,
    private readonly audit: AuditService,
    private readonly alertes: AlertesService,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  /** R9 : la pharmacie (uuid) doit être rattachée et validée pour ce compte. Sinon 404 et journal. */
  private async exigerMaPharmacie(compte: CompteConnecte, uuid: string, operation: string, ex: Executeur = this.base): Promise<MaPharmacie> {
    const [p] = await ex.requete<MaPharmacie>(
      `SELECT p.id, p.uuid FROM annuaire.pharmacie p
         JOIN prive.rattachement_pharmacien r ON r.pharmacie_id = p.id
        WHERE p.uuid = $1 AND r.utilisateur_id = $2 AND r.statut = 'validee'`,
      [uuid, compte.id],
    );
    if (!p) {
      // Hors de la transaction éventuelle : la trace reste même si la requête est annulée.
      await this.audit.ecrire(compte.id, 'acces_refuse', 'pharmacie', uuid, { operation });
      throw new ErreurApi(404, 'introuvable');
    }
    return p;
  }

  async mesPharmacies(compte: CompteConnecte) {
    const lignes = await this.base.requete<{ uuid: string; nom: string | null; statut_publication: string; declares: number }>(
      `SELECT p.uuid, p.nom, p.statut_publication,
              (SELECT count(*)::int FROM annuaire.stock s WHERE s.pharmacie_id = p.id AND s.statut IS NOT NULL) AS declares
         FROM prive.rattachement_pharmacien r JOIN annuaire.pharmacie p ON p.id = r.pharmacie_id
        WHERE r.utilisateur_id = $1 AND r.statut = 'validee'
        ORDER BY p.nom`,
      [compte.id],
    );
    return {
      elements: lignes.map((l) => ({
        id: l.uuid,
        nom: l.nom,
        // Visible du public seulement si « publiee » ; ne change jamais depuis cet espace.
        statutPublication: versFront(l.statut_publication),
        medicamentsDeclares: l.declares,
      })),
    };
  }

  async disponibilites(compte: CompteConnecte, uuid: string, f: DisponibilitesDto) {
    const p = await this.exigerMaPharmacie(compte, uuid, 'lire_disponibilites');
    const motif = f.q !== undefined ? echapperLike(f.q) : null;
    const condition = `s.pharmacie_id = $1 AND s.statut IS NOT NULL
      AND ($2::text IS NULL OR public.normaliser(m.nom_commercial) LIKE '%' || public.normaliser($2) || '%' ESCAPE '\\'
                            OR public.normaliser(m.dci) LIKE '%' || public.normaliser($2) || '%' ESCAPE '\\')`;
    const [{ total }] = await this.base.requete<{ total: number }>(
      `SELECT count(*)::int AS total FROM annuaire.stock s JOIN annuaire.medicament m ON m.id = s.medicament_id WHERE ${condition}`,
      [p.id, motif]);
    const lignes = await this.base.requete<LigneDispo>(
      `SELECT m.uuid AS medicament_uuid, m.nom_commercial, m.dci, m.forme, m.dosage, s.statut, s.declare_le
         FROM annuaire.stock s JOIN annuaire.medicament m ON m.id = s.medicament_id
        WHERE ${condition}
        ORDER BY m.nom_commercial, m.dosage NULLS FIRST, m.uuid
        LIMIT $3 OFFSET $4`,
      [p.id, motif, f.taille, (f.page - 1) * f.taille]);
    return { elements: lignes.map(disponibilite), page: f.page, taille: f.taille, total };
  }

  /** Déclare ou met à jour un statut. La date est celle du serveur ; l'historique se remplit par déclencheur. */
  async declarer(compte: CompteConnecte, uuid: string, medicamentUuid: string, statut: StatutFront) {
    const p = await this.exigerMaPharmacie(compte, uuid, 'declarer');
    const resultat = await this.base.transaction(async (tx) => {
      await acteur(tx, compte);
      const [l] = await tx.requete<LigneDispo>(
        `WITH m AS (SELECT id, uuid, nom_commercial, dci, forme, dosage FROM annuaire.medicament WHERE uuid = $2 AND actif),
              e AS (INSERT INTO annuaire.stock (pharmacie_id, medicament_id, statut, declare_le, declare_par)
                    SELECT $1, m.id, $3, now(), $4 FROM m
                    ON CONFLICT (pharmacie_id, medicament_id)
                    DO UPDATE SET statut = EXCLUDED.statut, declare_le = EXCLUDED.declare_le, declare_par = EXCLUDED.declare_par
                    RETURNING medicament_id, statut, declare_le)
         SELECT m.uuid AS medicament_uuid, m.nom_commercial, m.dci, m.forme, m.dosage, e.statut, e.declare_le
           FROM e JOIN m ON m.id = e.medicament_id`,
        [p.id, medicamentUuid, versBase(statut), compte.id]);
      if (!l) throw new ErreurApi(404, 'introuvable', { champs: ['medicamentId'] });
      return disponibilite(l);
    });
    await this.alertes.declencher(p.id);
    return resultat;
  }

  /** Lot de 100 déclarations au plus : tout ou rien, dans une seule transaction. */
  async declarerLot(compte: CompteConnecte, uuid: string, lot: LotDto) {
    const p = await this.exigerMaPharmacie(compte, uuid, 'declarer_lot');
    const uuids = lot.declarations.map((d) => d.medicamentId.toLowerCase());
    const connus = new Map(
      (await this.base.requete<{ uuid: string; id: string }>(
        `SELECT uuid::text, id FROM annuaire.medicament WHERE uuid = ANY($1::uuid[]) AND actif`, [uuids]))
        .map((m) => [m.uuid, m.id]),
    );
    const vus = new Set<string>();
    const lignes: { index: number; medicamentId: string; erreur: 'medicament-inconnu' | 'doublon' }[] = [];
    uuids.forEach((u, index) => {
      if (vus.has(u)) lignes.push({ index, medicamentId: lot.declarations[index].medicamentId, erreur: 'doublon' });
      else if (!connus.has(u)) lignes.push({ index, medicamentId: lot.declarations[index].medicamentId, erreur: 'medicament-inconnu' });
      vus.add(u);
    });
    if (lignes.length) throw new ErreurApi(400, 'lot-invalide', { lignes });

    const resultat = await this.base.transaction(async (tx) => {
      await acteur(tx, compte);
      return tx.requete<LigneDispo>(
        `WITH e AS (
           INSERT INTO annuaire.stock (pharmacie_id, medicament_id, statut, declare_le, declare_par)
           SELECT $1, d.medicament_id, d.statut, now(), $4
             FROM unnest($2::bigint[], $3::text[]) AS d (medicament_id, statut)
           ON CONFLICT (pharmacie_id, medicament_id)
           DO UPDATE SET statut = EXCLUDED.statut, declare_le = EXCLUDED.declare_le, declare_par = EXCLUDED.declare_par
           RETURNING medicament_id, statut, declare_le)
         SELECT m.uuid AS medicament_uuid, m.nom_commercial, m.dci, m.forme, m.dosage, e.statut, e.declare_le
           FROM e JOIN annuaire.medicament m ON m.id = e.medicament_id
          ORDER BY m.nom_commercial`,
        [p.id, uuids.map((u) => connus.get(u)!), lot.declarations.map((d) => versBase(d.statut)), compte.id]);
    });
    await this.alertes.declencher(p.id);
    return { declarees: resultat.length, elements: resultat.map(disponibilite) };
  }

  // ---------------------------------------------------------------- suivi et « tout confirmer » (Partie 9b)

  /** Médicaments suivis par ma pharmacie, déclarés ou non (identifiants). */
  async suivis(compte: CompteConnecte, uuid: string) {
    const p = await this.exigerMaPharmacie(compte, uuid, 'lire_suivis');
    const lignes = await this.base.requete<{ uuid: string }>(
      `SELECT m.uuid FROM annuaire.stock s JOIN annuaire.medicament m ON m.id = s.medicament_id
        WHERE s.pharmacie_id = $1 ORDER BY m.nom_commercial, m.dosage NULLS FIRST, m.uuid`, [p.id]);
    return { elements: lignes.map((l) => l.uuid) };
  }

  /** Suit un médicament sans le déclarer (ligne de stock sans statut). Sans effet s'il est déjà suivi. */
  async suivre(compte: CompteConnecte, uuid: string, medicamentUuid: string): Promise<{ nouveau: boolean }> {
    const p = await this.exigerMaPharmacie(compte, uuid, 'suivre');
    return this.base.transaction(async (tx) => {
      await acteur(tx, compte);
      const [m] = await tx.requete<{ id: string }>(`SELECT id FROM annuaire.medicament WHERE uuid = $1 AND actif`, [medicamentUuid]);
      if (!m) throw new ErreurApi(404, 'introuvable', { champs: ['medicamentId'] });
      const r = await tx.requete(
        `INSERT INTO annuaire.stock (pharmacie_id, medicament_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING medicament_id`, [p.id, m.id]);
      return { nouveau: r.length > 0 };
    });
  }

  /**
   * « Tout est à jour » : redéclare chaque statut existant à la date du serveur, sans le changer.
   * Chaque ligne passe dans l'historique (déclencheur 014) ; une seule entrée de journal.
   */
  async confirmerTout(compte: CompteConnecte, uuid: string) {
    const p = await this.exigerMaPharmacie(compte, uuid, 'confirmer_tout');
    const lignes = await this.base.transaction(async (tx) => {
      await acteur(tx, compte);
      const l = await tx.requete<LigneDispo>(
        `WITH e AS (UPDATE annuaire.stock SET declare_le = now(), declare_par = $2
                     WHERE pharmacie_id = $1 AND statut IS NOT NULL RETURNING medicament_id, statut, declare_le)
         SELECT m.uuid AS medicament_uuid, m.nom_commercial, m.dci, m.forme, m.dosage, e.statut, e.declare_le
           FROM e JOIN annuaire.medicament m ON m.id = e.medicament_id ORDER BY m.nom_commercial`, [p.id, compte.id]);
      await this.audit.ecrire(compte.id, 'confirmer_tout', 'pharmacie', uuid, { declarations: l.length }, tx);
      return l;
    });
    await this.alertes.declencher(p.id);
    return { confirmees: lignes.length, elements: lignes.map(disponibilite) };
  }

  /** Retire la déclaration : le médicament n'est plus listé ; l'historique est conservé. */
  async retirer(compte: CompteConnecte, uuid: string, medicamentUuid: string): Promise<void> {
    const p = await this.exigerMaPharmacie(compte, uuid, 'retirer');
    await this.base.transaction(async (tx) => {
      await acteur(tx, compte);
      const [r] = await tx.requete<{ statut: string | null }>(
        `DELETE FROM annuaire.stock s USING annuaire.medicament m
          WHERE s.pharmacie_id = $1 AND s.medicament_id = m.id AND m.uuid = $2
          RETURNING s.statut`,
        [p.id, medicamentUuid]);
      if (!r) throw new ErreurApi(404, 'introuvable', { champs: ['medicamentId'] });
      await this.audit.ecrire(compte.id, 'retirer_declaration', 'pharmacie', uuid,
        { medicament: medicamentUuid, ancienStatut: versFront(r.statut) }, tx);
    });
  }

  /** Mes déclarations sur cette pharmacie, de la plus récente à la plus ancienne (jamais celles d'un autre compte). */
  async historique(compte: CompteConnecte, uuid: string, page: PageDto) {
    const p = await this.exigerMaPharmacie(compte, uuid, 'lire_historique');
    const [{ total }] = await this.base.requete<{ total: number }>(
      `SELECT count(*)::int AS total FROM annuaire.historique_stock WHERE pharmacie_id = $1 AND declare_par = $2`, [p.id, compte.id]);
    const lignes = await this.base.requete<LigneDispo>(
      `SELECT m.uuid AS medicament_uuid, m.nom_commercial, m.dci, m.forme, m.dosage, h.statut, h.declare_le
         FROM annuaire.historique_stock h JOIN annuaire.medicament m ON m.id = h.medicament_id
        WHERE h.pharmacie_id = $1 AND h.declare_par = $2
        ORDER BY h.declare_le DESC, h.id DESC
        LIMIT $3 OFFSET $4`,
      [p.id, compte.id, page.taille, (page.page - 1) * page.taille]);
    return { elements: lignes.map(disponibilite), page: page.page, taille: page.taille, total };
  }

  /** Téléphones, garde, horaires : chaque champ modifié est journalisé avec l'ancienne et la nouvelle valeur. */
  async modifierFiche(compte: CompteConnecte, uuid: string, dto: ModificationFicheDto) {
    const champs = (['telephone', 'telephonesAutres', 'garde', 'horaires'] as const).filter((c) => dto[c] !== undefined);
    if (!champs.length) throw new ErreurApi(400, 'donnees-invalides', { champs: [] });
    if (dto.horaires) this.verifierPlages(dto.horaires);
    const p = await this.exigerMaPharmacie(compte, uuid, 'modifier_fiche');

    await this.base.transaction(async (tx) => {
      await acteur(tx, compte);
      const [avant] = await tx.requete<{ telephone_principal: string | null; telephones_autres: string[]; garde: string | null }>(
        `SELECT telephone_principal, telephones_autres, garde FROM annuaire.pharmacie WHERE id = $1 FOR UPDATE`, [p.id]);
      const horairesAvant = await this.lirePlages(tx, p.id);
      const changements: { champ: string; ancien: ValeurAudit; nouveau: ValeurAudit }[] = [];

      if (dto.telephone !== undefined && dto.telephone !== avant.telephone_principal) {
        changements.push({ champ: 'telephone', ancien: avant.telephone_principal, nouveau: dto.telephone });
      }
      if (dto.telephonesAutres !== undefined && JSON.stringify(dto.telephonesAutres) !== JSON.stringify(avant.telephones_autres)) {
        changements.push({ champ: 'telephonesAutres', ancien: avant.telephones_autres, nouveau: dto.telephonesAutres });
      }
      if (dto.garde !== undefined && dto.garde !== avant.garde) {
        changements.push({ champ: 'garde', ancien: avant.garde, nouveau: dto.garde });
      }
      const horairesNouveaux = dto.horaires ? [...dto.horaires].sort((a, b) => a.jour - b.jour || a.ouverture.localeCompare(b.ouverture)) : undefined;
      if (horairesNouveaux && JSON.stringify(horairesNouveaux) !== JSON.stringify(horairesAvant)) {
        changements.push({ champ: 'horaires', ancien: horairesAvant as unknown as ValeurAudit, nouveau: horairesNouveaux as unknown as ValeurAudit });
      }

      await tx.requete(
        `UPDATE annuaire.pharmacie
            SET telephone_principal = CASE WHEN $2 THEN $3 ELSE telephone_principal END,
                telephones_autres   = CASE WHEN $4 THEN $5::text[] ELSE telephones_autres END,
                garde               = CASE WHEN $6 THEN $7 ELSE garde END
          WHERE id = $1`,
        [p.id, dto.telephone !== undefined, dto.telephone ?? null, dto.telephonesAutres !== undefined, dto.telephonesAutres ?? [],
         dto.garde !== undefined, dto.garde ?? null]);
      if (horairesNouveaux) {
        await tx.requete(`DELETE FROM annuaire.horaire WHERE pharmacie_id = $1`, [p.id]);
        if (horairesNouveaux.length) {
          await tx.requete(
            `INSERT INTO annuaire.horaire (pharmacie_id, jour, ouverture, fermeture)
             SELECT $1, h.jour, h.ouverture::time, h.fermeture::time
               FROM unnest($2::smallint[], $3::text[], $4::text[]) AS h (jour, ouverture, fermeture)`,
            [p.id, horairesNouveaux.map((h) => String(h.jour)), horairesNouveaux.map((h) => h.ouverture), horairesNouveaux.map((h) => h.fermeture)]);
        }
      }
      for (const c of changements) {
        await this.audit.ecrire(compte.id, 'modifier_fiche', 'pharmacie', uuid, { champ: c.champ, ancien: c.ancien, nouveau: c.nouveau }, tx);
      }
    });
    return this.fiche(p);
  }

  // ---------------------------------------------------------------- position (Partie 8)

  /**
   * Propose une position. Elle ne change rien sur la fiche publique tant qu'un administrateur ne l'a pas
   * validée. Une nouvelle proposition remplace la demande en attente (conservée, statut « remplacee »).
   * Une autre pharmacie publiée à moins de 15 m : 409 « position-proche », sauf confirmation explicite.
   * La base vérifie aussi R9 (028) et la suspension (027).
   */
  async proposerPosition(compte: CompteConnecte, uuid: string, dto: PositionDto) {
    const { precisionMaxM, decimales } = this.config.positions;
    if (dto.precisionMetres !== undefined && dto.precisionMetres > precisionMaxM) {
      throw new ErreurApi(400, 'donnees-invalides', { champs: ['precisionMetres'], precisionMaxM });
    }
    const p = await this.exigerMaPharmacie(compte, uuid, 'proposer_position');
    const facteur = 10 ** decimales;
    const latitude = Math.round(dto.latitude * facteur) / facteur;
    const longitude = Math.round(dto.longitude * facteur) / facteur;
    const proches = await this.pharmaciesProches(p.id, latitude, longitude);
    if (proches.length && !dto.confirmerProximite) {
      throw new ErreurApi(409, 'position-proche', { pharmacies: proches });
    }
    return this.base.transaction(async (tx) => {
      await acteur(tx, compte);
      const remplacees = await tx.requete<{ uuid: string }>(
        `UPDATE prive.demande_position SET statut = 'remplacee', decide_le = now()
          WHERE pharmacie_id = $1 AND statut = 'en_attente' RETURNING uuid`, [p.id]);
      const [d] = await tx.requete<{ uuid: string; created_at: Date }>(
        `INSERT INTO prive.demande_position (pharmacie_id, demandeur_id, latitude, longitude, commentaire)
         VALUES ($1, $2, $3, $4, $5) RETURNING uuid, created_at`,
        [p.id, compte.id, latitude, longitude, dto.commentaire ?? null]);
      await this.audit.ecrire(compte.id, 'proposer_position', 'demande_position', d.uuid, {
        pharmacie: uuid, latitude, longitude, remplace: remplacees.map((r) => r.uuid),
        procheDe: proches.map((x) => x.id),
      }, tx);
      return {
        demande: { id: d.uuid, latitude, longitude, etat: 'en-attente', creeeLe: d.created_at.toISOString() },
        ...(proches.length ? { avertissement: { code: 'position-proche', pharmacies: proches } } : {}),
      };
    });
  }

  /** Ma dernière demande pour cette pharmacie, et la position actuelle de la fiche. */
  async etatPosition(compte: CompteConnecte, uuid: string) {
    const p = await this.exigerMaPharmacie(compte, uuid, 'lire_position');
    const [d] = await this.base.requete<{ uuid: string; latitude: number; longitude: number; commentaire: string | null;
      statut: string; motif_refus: string | null; created_at: Date; decide_le: Date | null }>(
      `SELECT uuid, latitude, longitude, commentaire, statut, motif_refus, created_at, decide_le
         FROM prive.demande_position WHERE pharmacie_id = $1 AND demandeur_id = $2
        ORDER BY created_at DESC, id DESC LIMIT 1`, [p.id, compte.id]);
    const [f] = await this.base.requete<{ latitude: number | null; longitude: number | null; position_confirmee: boolean }>(
      `SELECT latitude, longitude, position_confirmee FROM annuaire.pharmacie WHERE id = $1`, [p.id]);
    return {
      demande: d ? {
        id: d.uuid, latitude: d.latitude, longitude: d.longitude, commentaire: d.commentaire,
        etat: versFront(d.statut), creeeLe: d.created_at.toISOString(),
        ...(d.decide_le ? { decideeLe: d.decide_le.toISOString() } : {}),
        ...(d.motif_refus ? { motifRefus: d.motif_refus } : {}),
      } : null,
      positionActuelle: f.latitude === null ? null : { latitude: f.latitude, longitude: f.longitude, confirmee: f.position_confirmee },
    };
  }

  /** Autres pharmacies publiées à moins du rayon configuré (15 m par défaut) : boîte englobante, puis distance exacte. */
  private async pharmaciesProches(pharmacieId: string, latitude: number, longitude: number) {
    const lignes = await this.base.requete<{ uuid: string; nom: string; distance: number }>(
      `SELECT * FROM (
         SELECT p.uuid, p.nom, ${distanceMetresSql('$2', '$3', 'p.latitude', 'p.longitude')} AS distance
           FROM annuaire.pharmacie p
          WHERE p.statut_publication = 'publiee' AND p.id <> $1
            AND p.latitude BETWEEN $2::float8 - 0.0005 AND $2::float8 + 0.0005
            AND p.longitude BETWEEN $3::float8 - 0.0006 AND $3::float8 + 0.0006
       ) x WHERE x.distance <= $4 ORDER BY x.distance`,
      [pharmacieId, latitude, longitude, this.config.positions.rayonProximiteM]);
    return lignes.map((l) => ({ id: l.uuid, nom: l.nom, distanceM: Math.round(Number(l.distance) * 10) / 10 }));
  }

  private verifierPlages(plages: PlageDto[]): void {
    const champs: string[] = [];
    const vues = new Set<string>();
    plages.forEach((h, i) => {
      const cle = `${h.jour}-${h.ouverture}`;
      if (h.ouverture === h.fermeture || vues.has(cle)) champs.push(`horaires.${i}`);
      vues.add(cle);
    });
    if (champs.length) throw new ErreurApi(400, 'donnees-invalides', { champs });
  }

  private lirePlages(ex: Executeur, pharmacieId: string) {
    return ex.requete<{ jour: number; ouverture: string; fermeture: string }>(
      `SELECT jour, to_char(ouverture, 'HH24:MI') AS ouverture, to_char(fermeture, 'HH24:MI') AS fermeture
         FROM annuaire.horaire WHERE pharmacie_id = $1 ORDER BY jour, ouverture`, [pharmacieId]);
  }

  /** Ce que le pharmacien voit de sa fiche après modification (lecture seule pour les autres champs). */
  private async fiche(p: MaPharmacie) {
    const [f] = await this.base.requete<{ nom: string | null; ville: string | null; statut_publication: string;
      telephone_principal: string | null; telephones_autres: string[]; garde: string | null }>(
      `SELECT nom, ville, statut_publication, telephone_principal, telephones_autres, garde FROM annuaire.pharmacie WHERE id = $1`, [p.id]);
    return {
      id: p.uuid,
      nom: f.nom,
      ville: f.ville,
      statutPublication: versFront(f.statut_publication),
      telephone: f.telephone_principal,
      telephonesAutres: f.telephones_autres,
      garde: f.garde,
      horaires: await this.lirePlages(this.base, p.id),
    };
  }
}
