import { Injectable } from '@nestjs/common';
import { BaseService, Executeur } from '../base/base.service.js';

export type ActionAudit =
  | 'connexion_reussie'
  | 'connexion_echouee'
  | 'changer_mot_de_passe'
  | 'reinitialiser_mot_de_passe'
  | 'creer_administrateur'
  | 'valider'
  | 'refuser'
  | 'modifier_fiche'
  | 'retirer_declaration'
  | 'acces_refuse'
  | 'proposer_position'
  | 'valider_position'
  | 'refuser_position'
  | 'relire_nom'
  | 'changer_statut';

export type CibleAudit = 'utilisateur' | 'rattachement' | 'pharmacie' | 'demande_position';

/**
 * Détail : des codes courts et, pour une modification de fiche, l'ancienne et la nouvelle valeur
 * (données publiques de la pharmacie). Jamais de mot de passe, de jeton, d'adresse IP ni d'adresse e-mail.
 */
export type ValeurAudit = string | number | boolean | null | ValeurAudit[] | { [cle: string]: ValeurAudit };
export type DetailAudit = Record<string, ValeurAudit>;

/** Journal d'audit (prive.journal_audit), en ajout seul. */
@Injectable()
export class AuditService {
  constructor(private readonly base: BaseService) {}

  async ecrire(
    acteurId: string | null,
    action: ActionAudit,
    cibleType: CibleAudit,
    cibleId: string,
    detail: DetailAudit = {},
    ex: Executeur = this.base,
  ): Promise<void> {
    await ex.requete(
      `INSERT INTO prive.journal_audit (acteur_id, action, cible_type, cible_id, detail) VALUES ($1, $2, $3, $4, $5)`,
      [acteurId, action, cibleType, cibleId, JSON.stringify(detail)],
    );
  }
}
