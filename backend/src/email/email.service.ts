import { Inject, Injectable, Logger } from '@nestjs/common';
import { BaseService } from '../base/base.service.js';
import { FOURNISSEUR_EMAIL } from '../config/jetons-injection.js';
import type { FournisseurEmail, MessageEmail } from './fournisseurs.js';
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

  /**
   * Envoie un e-mail déjà inscrit dans la file (alerte, rappel). Succès : « envoye ». Échec : nouvel essai
   * plus tard (5, 10, 20… minutes), puis « abandonne » après essaisMax essais. Seul le nom de l'erreur est gardé.
   */
  async envoyerLigne(id: string, message: MessageEmail, essaisMax: number): Promise<boolean> {
    try {
      await this.fournisseur.envoyer(message);
      await this.base.requete(
        `UPDATE prive.envoi_email SET statut = 'envoye', envoye_le = now(), tentatives = tentatives + 1 WHERE id = $1`, [id]);
      return true;
    } catch (e) {
      const nom = e instanceof Error ? e.name : 'Erreur';
      this.journal.error(`Échec d'envoi (e-mail ${id}) : ${nom}`);
      await this.base.requete(
        `UPDATE prive.envoi_email
            SET tentatives = tentatives + 1, derniere_erreur = $2,
                statut = CASE WHEN tentatives + 1 >= $3 THEN 'abandonne' ELSE 'a_envoyer' END,
                prochaine_tentative_le = now() + make_interval(mins => 5 * power(2, tentatives)::int)
          WHERE id = $1`,
        [id, nom, essaisMax]);
      return false;
    }
  }

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
