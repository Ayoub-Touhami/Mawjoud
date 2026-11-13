import { Inject, Injectable, Logger } from '@nestjs/common';
import { BaseService, type Executeur } from '../base/base.service.js';
import { CONFIGURATION } from '../config/jetons-injection.js';
import type { Configuration } from '../config/configuration.js';
import { EmailService } from '../email/email.service.js';
import { composerAlerte, composerRappel } from '../email/modeles.js';
import { ErreurApi } from '../securite/erreurs.js';
import { empreinte, genererJeton } from '../securite/jetons.js';
import type { CompteConnecte } from '../securite/sessions.service.js';
import type { CreationAlerteDto } from './dto.js';

/**
 * Alertes des patients (F10, F11, F12), rappels aux pharmacies, file des e-mails (Partie 9b).
 *
 * Vie privée (décisions du 13 novembre 2026) : compte vérifié obligatoire ; consentement daté ; une alerte
 * déclenchée est effacée après purgeJours ; une alerte supprimée ou désinscrite est effacée tout de suite ;
 * le médicament n'apparaît ni dans le journal d'audit ni dans les journaux du serveur, ni dans le sujet des
 * e-mails ; un lien de désinscription dans chaque e-mail d'alerte.
 */
interface LigneAlerte {
  uuid: string;
  statut: string;
  declenchee_le: Date | null;
  created_at: Date;
  medicament_uuid: string;
  nom_commercial: string;
  dci: string;
  forme: string | null;
  dosage: string | null;
  gouvernorat_code: number | null;
  gouvernorat: string | null;
}

const SELECT_ALERTE = `
  SELECT a.uuid, a.statut, a.declenchee_le, a.created_at,
         m.uuid AS medicament_uuid, m.nom_commercial, m.dci, m.forme, m.dosage,
         a.gouvernorat_code, g.nom AS gouvernorat
    FROM prive.alerte a
    JOIN annuaire.medicament m ON m.id = a.medicament_id
    LEFT JOIN annuaire.gouvernorat g ON g.code = a.gouvernorat_code`;

function alerte(l: LigneAlerte) {
  return {
    id: l.uuid,
    medicament: { id: l.medicament_uuid, nomCommercial: l.nom_commercial, dci: l.dci, forme: l.forme, dosage: l.dosage },
    gouvernorat: l.gouvernorat_code === null ? null : { code: l.gouvernorat_code, nom: l.gouvernorat },
    etat: l.statut === 'active' ? 'active' : 'terminee',
    creeeLe: l.created_at.toISOString(),
    ...(l.declenchee_le ? { declencheeLe: l.declenchee_le.toISOString() } : {}),
  };
}

export interface BilanTaches {
  rappelsPrepares: number;
  envoyes: number;
  echecs: number;
  alertesEffacees: number;
}

@Injectable()
export class AlertesService {
  private readonly journal = new Logger('Alertes');
  /** Envois lancés après une réponse : attendus par les tests et à l'arrêt. */
  private readonly travaux = new Set<Promise<unknown>>();

  constructor(
    private readonly base: BaseService,
    private readonly emails: EmailService,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  // ---------------------------------------------------------------- patient

  async lister(compte: CompteConnecte) {
    const lignes = await this.base.requete<LigneAlerte>(
      `${SELECT_ALERTE} WHERE a.utilisateur_id = $1 ORDER BY a.statut, a.created_at DESC`, [compte.id]);
    return { elements: lignes.map(alerte) };
  }

  /** Crée l'alerte, ou renvoie celle qui existe déjà pour ce médicament et ce lieu (existante: true, F10). */
  async creer(compte: CompteConnecte, dto: CreationAlerteDto) {
    return this.base.transaction(async (tx) => {
      // Un seul ajout à la fois par compte (plafond respecté même en cas de requêtes simultanées).
      await tx.requete(`SELECT pg_advisory_xact_lock(hashtext('mawjoud:alertes'), $1::int)`, [Number(compte.id) % 2147483647]);
      const [m] = await tx.requete<{ id: string }>(`SELECT id FROM annuaire.medicament WHERE uuid = $1 AND actif`, [dto.medicamentId]);
      if (!m) throw new ErreurApi(404, 'introuvable', { champs: ['medicamentId'] });
      if (dto.gouvernorat !== null) {
        const [g] = await tx.requete(`SELECT 1 FROM annuaire.gouvernorat WHERE code = $1`, [dto.gouvernorat]);
        if (!g) throw new ErreurApi(400, 'donnees-invalides', { champs: ['gouvernorat'] });
      }
      const [deja] = await tx.requete<LigneAlerte>(
        `${SELECT_ALERTE} WHERE a.utilisateur_id = $1 AND a.medicament_id = $2 AND a.gouvernorat_code IS NOT DISTINCT FROM $3 AND a.statut = 'active'`,
        [compte.id, m.id, dto.gouvernorat]);
      if (deja) return { alerte: alerte(deja), existante: true };
      const [{ n }] = await tx.requete<{ n: number }>(
        `SELECT count(*)::int AS n FROM prive.alerte WHERE utilisateur_id = $1 AND statut = 'active'`, [compte.id]);
      if (n >= this.config.alertes.maxParCompte) {
        throw new ErreurApi(409, 'trop-d-alertes', { maximum: this.config.alertes.maxParCompte });
      }
      const [{ uuid }] = await tx.requete<{ uuid: string }>(
        `INSERT INTO prive.alerte (utilisateur_id, medicament_id, gouvernorat_code, consentement_le)
         VALUES ($1, $2, $3, now()) RETURNING uuid`, [compte.id, m.id, dto.gouvernorat]);
      const [l] = await tx.requete<LigneAlerte>(`${SELECT_ALERTE} WHERE a.uuid = $1`, [uuid]);
      return { alerte: alerte(l), existante: false };
    });
  }

  async modifier(compte: CompteConnecte, uuid: string, gouvernorat: number | null) {
    return this.base.transaction(async (tx) => {
      const [a] = await tx.requete<{ id: string; medicament_id: string; statut: string }>(
        `SELECT id, medicament_id, statut FROM prive.alerte WHERE uuid = $1 AND utilisateur_id = $2 FOR UPDATE`, [uuid, compte.id]);
      if (!a) throw new ErreurApi(404, 'introuvable');
      if (a.statut !== 'active') throw new ErreurApi(409, 'deja-decidee', { etat: 'terminee' });
      if (gouvernorat !== null) {
        const [g] = await tx.requete(`SELECT 1 FROM annuaire.gouvernorat WHERE code = $1`, [gouvernorat]);
        if (!g) throw new ErreurApi(400, 'donnees-invalides', { champs: ['gouvernorat'] });
      }
      const [doublon] = await tx.requete(
        `SELECT 1 FROM prive.alerte WHERE utilisateur_id = $1 AND medicament_id = $2 AND gouvernorat_code IS NOT DISTINCT FROM $3
            AND statut = 'active' AND id <> $4`, [compte.id, a.medicament_id, gouvernorat, a.id]);
      if (doublon) throw new ErreurApi(409, 'doublon');
      await tx.requete(`UPDATE prive.alerte SET gouvernorat_code = $2 WHERE id = $1`, [a.id, gouvernorat]);
      const [l] = await tx.requete<LigneAlerte>(`${SELECT_ALERTE} WHERE a.id = $1`, [a.id]);
      return alerte(l);
    });
  }

  /** Supprime l'alerte (et son e-mail éventuel) : rien n'est gardé. */
  async supprimer(compte: CompteConnecte, uuid: string): Promise<void> {
    const r = await this.base.requete(`DELETE FROM prive.alerte WHERE uuid = $1 AND utilisateur_id = $2 RETURNING id`, [uuid, compte.id]);
    if (!r.length) throw new ErreurApi(404, 'introuvable');
  }

  /**
   * Lien de désinscription (sans connexion) : efface toutes les alertes actives du compte.
   * Le lien reste valable (F12) : le cliquer de nouveau ne change rien et ne renvoie pas d'erreur.
   */
  async desabonner(jeton: string): Promise<{ alertesArretees: number }> {
    return this.base.transaction(async (tx) => {
      const [j] = await tx.requete<{ utilisateur_id: string }>(
        `SELECT utilisateur_id FROM prive.jeton WHERE jeton_hache = $1 AND type = 'desabonnement'`, [empreinte(jeton)]);
      if (!j) throw new ErreurApi(400, 'lien-invalide');
      const r = await tx.requete(`DELETE FROM prive.alerte WHERE utilisateur_id = $1 AND statut = 'active' RETURNING id`, [j.utilisateur_id]);
      await tx.requete(`UPDATE prive.jeton SET utilise_le = coalesce(utilise_le, now()) WHERE jeton_hache = $1`, [empreinte(jeton)]);
      return { alertesArretees: r.length };
    });
  }

  // ---------------------------------------------------------------- déclenchement

  /**
   * Après une déclaration (ou une publication) : chaque alerte active qui correspond à une disponibilité
   * visible du public (pharmacie publiée et inscrite, statut disponible ou quantité limitée) passe à
   * « terminee » et reçoit un seul e-mail (R11 : index unique de 016). L'envoi part après la réponse.
   */
  async declencher(pharmacieId: string, medicamentIds: string[] | null = null): Promise<number> {
    const lignes = await this.base.requete<{ id: string }>(
      `WITH dispo AS (
         SELECT s.medicament_id, p.id AS pharmacie_id, p.gouvernorat_code
           FROM annuaire.stock s JOIN annuaire.pharmacie p ON p.id = s.pharmacie_id
          WHERE s.pharmacie_id = $1 AND s.statut IN ('disponible', 'quantite_limitee')
            AND ($2::bigint[] IS NULL OR s.medicament_id = ANY($2::bigint[]))
            AND p.statut_publication = 'publiee'
            AND EXISTS (SELECT 1 FROM prive.rattachement_pharmacien r JOIN prive.utilisateur u ON u.id = r.utilisateur_id
                         WHERE r.pharmacie_id = p.id AND r.statut = 'validee' AND NOT u.suspendu)
       ), cibles AS (
         SELECT a.id, a.utilisateur_id, d.pharmacie_id
           FROM prive.alerte a
           JOIN dispo d ON d.medicament_id = a.medicament_id
           JOIN prive.utilisateur u ON u.id = a.utilisateur_id
          WHERE a.statut = 'active' AND (a.gouvernorat_code IS NULL OR a.gouvernorat_code = d.gouvernorat_code)
            AND u.email_verifie_le IS NOT NULL AND NOT u.suspendu
          FOR UPDATE OF a SKIP LOCKED
       ), terminees AS (
         UPDATE prive.alerte a SET statut = 'terminee', declenchee_le = now(), declenchee_par_pharmacie = c.pharmacie_id
           FROM cibles c WHERE a.id = c.id
         RETURNING a.id, a.utilisateur_id, c.pharmacie_id
       )
       INSERT INTO prive.envoi_email (type, utilisateur_id, alerte_id, pharmacie_id)
       SELECT 'alerte', t.utilisateur_id, t.id, t.pharmacie_id FROM terminees t
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [pharmacieId, medicamentIds]);
    if (lignes.length) this.enArrierePlan(this.traiterFile());
    return lignes.length;
  }

  private enArrierePlan(travail: Promise<unknown>): void {
    const suivi = travail.catch((e: unknown) => this.journal.error(`Envoi en arrière-plan : ${e instanceof Error ? e.name : 'erreur'}`));
    this.travaux.add(suivi);
    void suivi.finally(() => this.travaux.delete(suivi));
  }

  async travauxTermines(): Promise<void> {
    while (this.travaux.size) await Promise.all([...this.travaux]);
  }

  // ---------------------------------------------------------------- file d'envoi, rappels, purge

  /** Envoie les e-mails d'alerte et de rappel en attente dont l'heure est venue. */
  async traiterFile(limite = 100): Promise<{ envoyes: number; echecs: number }> {
    const lignes = await this.base.requete<{ id: string; type: string; email: string; utilisateur_id: string;
      alerte_id: string | null; pharmacie_uuid: string; pharmacie_nom: string | null; ville: string | null;
      medicament: string | null; dosage: string | null }>(
      `UPDATE prive.envoi_email e SET prochaine_tentative_le = now() + interval '10 minutes'
         FROM (SELECT id FROM prive.envoi_email
                WHERE statut = 'a_envoyer' AND type IN ('alerte', 'rappel_mise_a_jour') AND prochaine_tentative_le <= now()
                ORDER BY prochaine_tentative_le LIMIT $1 FOR UPDATE SKIP LOCKED) x
        WHERE e.id = x.id
       RETURNING e.id, e.type, e.utilisateur_id, e.alerte_id,
                 (SELECT email FROM prive.utilisateur u WHERE u.id = e.utilisateur_id) AS email,
                 (SELECT uuid FROM annuaire.pharmacie p WHERE p.id = e.pharmacie_id) AS pharmacie_uuid,
                 (SELECT nom FROM annuaire.pharmacie p WHERE p.id = e.pharmacie_id) AS pharmacie_nom,
                 (SELECT ville FROM annuaire.pharmacie p WHERE p.id = e.pharmacie_id) AS ville,
                 (SELECT m.nom_commercial FROM prive.alerte a JOIN annuaire.medicament m ON m.id = a.medicament_id WHERE a.id = e.alerte_id) AS medicament,
                 (SELECT m.dosage FROM prive.alerte a JOIN annuaire.medicament m ON m.id = a.medicament_id WHERE a.id = e.alerte_id) AS dosage`,
      [limite]);
    let envoyes = 0;
    let echecs = 0;
    for (const l of lignes) {
      const front = this.config.frontUrl;
      let message;
      if (l.type === 'alerte') {
        // Un lien de désinscription par e-mail : seule son empreinte est gardée.
        const jeton = genererJeton();
        await this.base.requete(
          `INSERT INTO prive.jeton (utilisateur_id, type, jeton_hache) VALUES ($1, 'desabonnement', $2)`, [l.utilisateur_id, empreinte(jeton)]);
        message = composerAlerte(l.email, {
          medicament: [l.medicament, l.dosage].filter(Boolean).join(' '),
          pharmacie: l.pharmacie_nom ?? 'une pharmacie',
          ville: l.ville,
          lienFiche: `${front}/pharmacie/${l.pharmacie_uuid}`,
          lienDesabonnement: `${front}/compte/desabonnement?jeton=${jeton}`,
        });
      } else {
        message = composerRappel(l.email, {
          pharmacie: l.pharmacie_nom ?? 'votre pharmacie',
          jours: this.config.alertes.rappelJours,
          lienEspace: `${front}/pharmacien`,
        });
      }
      if (await this.emails.envoyerLigne(l.id, message, this.config.alertes.essaisMax)) envoyes++;
      else echecs++;
    }
    return { envoyes, echecs };
  }

  /**
   * Pharmacie publiée et inscrite sans mise à jour depuis rappelJours (depuis la validation du rattachement
   * si elle n'a jamais rien déclaré) : un rappel au pharmacien, au plus un par période.
   */
  async preparerRappels(ex: Executeur = this.base): Promise<number> {
    const r = await ex.requete(
      `INSERT INTO prive.envoi_email (type, utilisateur_id, pharmacie_id)
       SELECT 'rappel_mise_a_jour', r.utilisateur_id, p.id
         FROM annuaire.pharmacie p
         JOIN prive.rattachement_pharmacien r ON r.pharmacie_id = p.id AND r.statut = 'validee'
         JOIN prive.utilisateur u ON u.id = r.utilisateur_id AND NOT u.suspendu AND u.email_verifie_le IS NOT NULL
        WHERE p.statut_publication = 'publiee'
          AND greatest(r.decide_le, (SELECT max(s.declare_le) FROM annuaire.stock s WHERE s.pharmacie_id = p.id AND s.statut IS NOT NULL))
              < now() - make_interval(days => $1)
          AND NOT EXISTS (SELECT 1 FROM prive.envoi_email e
                           WHERE e.type = 'rappel_mise_a_jour' AND e.pharmacie_id = p.id
                             AND e.created_at > now() - make_interval(days => $1))
       RETURNING id`,
      [this.config.alertes.rappelJours]);
    return r.length;
  }

  /** Efface les alertes déclenchées depuis plus de purgeJours (avec leur e-mail, par cascade). */
  async purger(): Promise<number> {
    const r = await this.base.requete(
      `DELETE FROM prive.alerte WHERE statut = 'terminee' AND declenchee_le < now() - make_interval(days => $1) RETURNING id`,
      [this.config.alertes.purgeJours]);
    return r.length;
  }

  /** La tâche planifiée (scripts/taches.ts) : rappels, file d'envoi, purge. Ne renvoie que des nombres. */
  async executerTaches(): Promise<BilanTaches> {
    const rappelsPrepares = await this.preparerRappels();
    const { envoyes, echecs } = await this.traiterFile(500);
    const alertesEffacees = await this.purger();
    return { rappelsPrepares, envoyes, echecs, alertesEffacees };
  }
}
