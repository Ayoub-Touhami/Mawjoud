import { Injectable } from '@nestjs/common';
import { BaseService, Executeur } from '../base/base.service.js';

export type ActionAudit =
  | 'connexion_reussie'
  | 'connexion_echouee'
  | 'changer_mot_de_passe'
  | 'reinitialiser_mot_de_passe'
  | 'creer_administrateur'
  | 'valider'
  | 'refuser';

export type CibleAudit = 'utilisateur' | 'rattachement';

/** Détail autorisé : des codes courts, jamais de mot de passe, de jeton, d'adresse IP ni d'adresse e-mail. */
export type DetailAudit = Record<string, string | boolean | null>;

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
