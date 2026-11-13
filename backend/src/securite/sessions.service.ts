import { Inject, Injectable } from '@nestjs/common';
import { BaseService, Executeur } from '../base/base.service.js';
import { CONFIGURATION } from '../config/jetons-injection.js';
import type { Configuration } from '../config/configuration.js';
import { egalEnTempsConstant, empreinte, genererJeton } from './jetons.js';

export type Role = 'patient' | 'pharmacien' | 'administrateur';

/** Compte connecté, tel que lu à chaque requête. */
export interface CompteConnecte {
  id: string; // identifiant interne (bigint) : ne sort jamais de l'API
  uuid: string;
  email: string;
  role: Role;
  emailVerifie: boolean;
  suspendu: boolean;
}

export interface SessionOuverte {
  idHache: Buffer;
  compte: CompteConnecte;
  /** Empreinte du jeton CSRF associé à la session. */
  csrfHache: Buffer | null;
  expireLe: Date;
  /** Vrai si l'échéance vient d'être repoussée : le cookie doit être renvoyé. */
  prolongee: boolean;
}

interface LigneSession {
  id_hache: Buffer;
  donnees: { csrf?: string };
  expire_le: Date;
  a_rafraichir: boolean;
  id: string;
  uuid: string;
  email: string;
  role: Role;
  email_verifie_le: Date | null;
  suspendu: boolean;
}

/**
 * Sessions côté serveur (prive.session). Le cookie porte un identifiant aléatoire de 256 bits ;
 * la base n'en garde que l'empreinte SHA-256. Expiration glissante (7 jours), plafonnée
 * à 30 jours après l'ouverture. Pas de JWT.
 */
@Injectable()
export class SessionsService {
  constructor(
    private readonly base: BaseService,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  /** Ouvre une session neuve (identifiant jamais réutilisé) et renvoie les deux jetons en clair, une seule fois. */
  async ouvrir(utilisateurId: string, ex: Executeur = this.base): Promise<{ jeton: string; csrf: string; expireLe: Date }> {
    const jeton = genererJeton();
    const csrf = genererJeton();
    const { dureeGlissanteMs } = this.config.session;
    // Les sessions expirées de ce compte sont effacées au passage.
    await ex.requete(`DELETE FROM prive.session WHERE utilisateur_id = $1 AND expire_le <= now()`, [utilisateurId]);
    const [s] = await ex.requete<{ expire_le: Date }>(
      `INSERT INTO prive.session (id_hache, utilisateur_id, donnees, expire_le)
       VALUES ($1, $2, jsonb_build_object('csrf', $3::text), now() + make_interval(secs => $4))
       RETURNING expire_le`,
      [empreinte(jeton), utilisateurId, empreinte(csrf).toString('hex'), dureeGlissanteMs / 1000],
    );
    return { jeton, csrf, expireLe: s.expire_le };
  }

  /** Lit une session valable ; repousse son échéance au plus toutes les 5 minutes. */
  async lire(jeton: string): Promise<SessionOuverte | null> {
    const { dureeGlissanteMs, dureeMaxMs, rafraichirApresMs } = this.config.session;
    const [l] = await this.base.requete<LigneSession>(
      `SELECT s.id_hache, s.donnees, s.expire_le,
              s.derniere_activite_le < now() - make_interval(secs => $2) AS a_rafraichir,
              u.id, u.uuid, u.email, u.role, u.email_verifie_le, u.suspendu
         FROM prive.session s JOIN prive.utilisateur u ON u.id = s.utilisateur_id
        WHERE s.id_hache = $1 AND s.expire_le > now()`,
      [empreinte(jeton), rafraichirApresMs / 1000],
    );
    if (!l) return null;
    let expireLe = l.expire_le;
    if (l.a_rafraichir) {
      const [m] = await this.base.requete<{ expire_le: Date }>(
        `UPDATE prive.session
            SET derniere_activite_le = now(),
                expire_le = least(now() + make_interval(secs => $2), created_at + make_interval(secs => $3))
          WHERE id_hache = $1
          RETURNING expire_le`,
        [l.id_hache, dureeGlissanteMs / 1000, dureeMaxMs / 1000],
      );
      if (m) expireLe = m.expire_le;
    }
    return {
      idHache: l.id_hache,
      csrfHache: l.donnees.csrf ? Buffer.from(l.donnees.csrf, 'hex') : null,
      expireLe,
      prolongee: l.a_rafraichir,
      compte: {
        id: l.id,
        uuid: l.uuid,
        email: l.email,
        role: l.role,
        emailVerifie: l.email_verifie_le !== null,
        suspendu: l.suspendu,
      },
    };
  }

  /** Nouveau jeton CSRF pour une session existante (cookie XSRF-TOKEN perdu). */
  async renouvelerCsrf(idHache: Buffer): Promise<string> {
    const csrf = genererJeton();
    await this.base.requete(
      `UPDATE prive.session SET donnees = donnees || jsonb_build_object('csrf', $2::text) WHERE id_hache = $1`,
      [idHache, empreinte(csrf).toString('hex')],
    );
    return csrf;
  }

  csrfValide(session: SessionOuverte, jetonRecu: string | undefined): boolean {
    if (!jetonRecu || !session.csrfHache) return false;
    return egalEnTempsConstant(empreinte(jetonRecu), session.csrfHache);
  }

  async fermer(idHache: Buffer): Promise<void> {
    await this.base.requete(`DELETE FROM prive.session WHERE id_hache = $1`, [idHache]);
  }

  /** Ferme toutes les sessions d'un compte (changement ou réinitialisation du mot de passe). */
  async fermerToutes(utilisateurId: string, ex: Executeur = this.base): Promise<void> {
    await ex.requete(`DELETE FROM prive.session WHERE utilisateur_id = $1`, [utilisateurId]);
  }
}
