import { Inject, Injectable, Logger } from '@nestjs/common';
import { BaseService } from '../base/base.service.js';
import { FOURNISSEUR_EMAIL } from '../config/jetons-injection.js';
import type { FournisseurEmail } from './fournisseurs.js';
import { composer, type Langue, type TypeEmail } from './modeles.js';

/**
 * Envoi des e-mails de compte, tracé dans prive.envoi_email (type, destinataire, statut, tentatives).
 * Ni le contenu ni le lien ne sont stockés : le lien contient un jeton.
 * En cas d'échec, la ligne reste « a_envoyer » avec l'erreur (nom seulement) pour une nouvelle tentative.
 */
@Injectable()
export class EmailService {
  private readonly journal = new Logger('E-mails');

  constructor(
    private readonly base: BaseService,
    @Inject(FOURNISSEUR_EMAIL) private readonly fournisseur: FournisseurEmail,
  ) {}

  async envoyer(type: TypeEmail, utilisateurId: string, adresse: string, langue: Langue, lien: string): Promise<void> {
    const [ligne] = await this.base.requete<{ id: string }>(
      `INSERT INTO prive.envoi_email (type, utilisateur_id) VALUES ($1, $2) RETURNING id`,
      [type, utilisateurId],
    );
    try {
      await this.fournisseur.envoyer(composer(type, langue, adresse, lien));
      await this.base.requete(
        `UPDATE prive.envoi_email SET statut = 'envoye', envoye_le = now(), tentatives = tentatives + 1 WHERE id = $1`,
        [ligne.id],
      );
    } catch (e) {
      const nom = e instanceof Error ? e.name : 'Erreur';
      this.journal.error(`Échec d'envoi (e-mail ${ligne.id}, type ${type}) : ${nom}`);
      await this.base.requete(
        `UPDATE prive.envoi_email
            SET tentatives = tentatives + 1, derniere_erreur = $2, prochaine_tentative_le = now() + interval '5 minutes'
          WHERE id = $1`,
        [ligne.id, nom],
      );
    }
  }
}
