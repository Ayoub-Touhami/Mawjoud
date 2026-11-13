import { Inject, Injectable, Logger } from '@nestjs/common';
import { AuditService } from '../audit/audit.service.js';
import { BaseService, Executeur } from '../base/base.service.js';
import { CONFIGURATION } from '../config/jetons-injection.js';
import type { Configuration } from '../config/configuration.js';
import { EmailService } from '../email/email.service.js';
import type { Langue } from '../email/modeles.js';
import { ErreurApi } from '../securite/erreurs.js';
import { empreinte, genererJeton } from '../securite/jetons.js';
import { cleEmail, LimiteursService } from '../securite/limiteurs.service.js';
import { MotsDePasseService } from '../securite/mots-de-passe.service.js';
import { SessionsService, type CompteConnecte, type Role } from '../securite/sessions.service.js';
import type {
  ChangementMotDePasseDto,
  ConnexionDto,
  InscriptionDto,
  MotDePasseOublieDto,
  ReinitialisationDto,
  RenvoiLienDto,
  UtilisateurReponse,
} from './dto.js';

type TypeJeton = 'verification_email' | 'reinitialisation_mot_de_passe';

interface LigneJeton {
  id: string;
  utilisateur_id: string;
  utilise: boolean;
  expire: boolean;
  email: string;
  email_verifie: boolean;
}

@Injectable()
export class ComptesService {
  private readonly journal = new Logger('Comptes');
  /** Travaux lancés après la réponse (mot de passe oublié) : attendus à l'arrêt et par les tests. */
  private readonly travaux = new Set<Promise<void>>();

  constructor(
    private readonly base: BaseService,
    private readonly mdp: MotsDePasseService,
    private readonly sessions: SessionsService,
    private readonly limiteurs: LimiteursService,
    private readonly emails: EmailService,
    private readonly audit: AuditService,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  // ---------------------------------------------------------------- jetons d'e-mail

  /** Crée un jeton à usage unique ; les jetons encore valables du même type expirent aussitôt. */
  private async creerJeton(ex: Executeur, utilisateurId: string, type: TypeJeton): Promise<string> {
    const dureeMs = type === 'verification_email' ? this.config.jetons.verificationMs : this.config.jetons.reinitialisationMs;
    await ex.requete(
      `UPDATE prive.jeton SET expire_le = least(expire_le, now())
        WHERE utilisateur_id = $1 AND type = $2 AND utilise_le IS NULL`,
      [utilisateurId, type],
    );
    const jeton = genererJeton();
    await ex.requete(
      `INSERT INTO prive.jeton (utilisateur_id, type, jeton_hache, expire_le)
       VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
      [utilisateurId, type, empreinte(jeton), dureeMs / 1000],
    );
    return jeton;
  }

  private async lireJeton(jeton: string, type: TypeJeton): Promise<LigneJeton | undefined> {
    const [l] = await this.base.requete<LigneJeton>(
      `SELECT j.id, j.utilisateur_id, j.utilise_le IS NOT NULL AS utilise, j.expire_le <= now() AS expire,
              u.email, u.email_verifie_le IS NOT NULL AS email_verifie
         FROM prive.jeton j JOIN prive.utilisateur u ON u.id = j.utilisateur_id
        WHERE j.jeton_hache = $1 AND j.type = $2`,
      [empreinte(jeton), type],
    );
    return l;
  }

  /** Jeton utilisable, sinon lien-invalide (inconnu ou déjà utilisé) ou lien-expire. */
  private async exigerJetonValable(jeton: string, type: TypeJeton): Promise<LigneJeton> {
    const l = await this.lireJeton(jeton, type);
    if (!l || l.utilise) throw new ErreurApi(400, 'lien-invalide');
    if (l.expire) throw new ErreurApi(410, 'lien-expire');
    return l;
  }

  /** Marque le jeton utilisé ; échoue si une autre requête l'a utilisé entre-temps. */
  private async consommer(ex: Executeur, jetonId: string): Promise<void> {
    const r = await ex.requete(
      `UPDATE prive.jeton SET utilise_le = now() WHERE id = $1 AND utilise_le IS NULL AND expire_le > now() RETURNING id`,
      [jetonId],
    );
    if (!r.length) throw new ErreurApi(400, 'lien-invalide');
  }

  private lien(chemin: string, jeton?: string): string {
    return `${this.config.frontUrl}${chemin}${jeton ? `?jeton=${jeton}` : ''}`;
  }

  // ---------------------------------------------------------------- inscription

  /**
   * Réponse identique que l'adresse soit libre ou non (décision du 13 novembre 2026) :
   * - adresse libre : compte créé, lien de vérification envoyé ;
   * - adresse prise : son propriétaire reçoit « vous avez déjà un compte ».
   * Un pharmacien s'inscrit de la même façon ; son compte n'est « vérifié » qu'après validation
   * de son rattachement par l'administrateur.
   */
  async inscrire(role: Extract<Role, 'patient' | 'pharmacien'>, dto: InscriptionDto, ip: string): Promise<void> {
    const email = cleEmail(dto.email);
    const langue: Langue = dto.langue ?? 'fr';
    this.limiteurs.exiger([this.limiteurs.envoisIp, ip]);
    const motif = this.mdp.verifierPolitique(dto.motDePasse, email);
    if (motif) throw new ErreurApi(400, 'mot-de-passe-faible', { motif });
    this.limiteurs.envoisIp.enregistrer(ip);

    const hache = await this.mdp.hacher(dto.motDePasse);
    const cree = await this.base.transaction(async (tx) => {
      const [u] = await tx.requete<{ id: string }>(
        `INSERT INTO prive.utilisateur (email, mot_de_passe_hache, role) VALUES ($1, $2, $3)
         ON CONFLICT ((lower(email))) DO NOTHING RETURNING id`,
        [email, hache, role],
      );
      return u ? { id: u.id, jeton: await this.creerJeton(tx, u.id, 'verification_email') } : null;
    });

    if (cree) {
      await this.emails.envoyer('verification_email', cree.id, email, langue, this.lien('/compte/verification-email', cree.jeton));
      return;
    }
    const [existant] = await this.base.requete<{ id: string }>(`SELECT id FROM prive.utilisateur WHERE lower(email) = $1`, [email]);
    if (existant && !this.limiteurs.envoisEmail.estBloque(email)) {
      this.limiteurs.envoisEmail.enregistrer(email);
      await this.emails.envoyer('compte_existant', existant.id, email, langue, this.lien('/compte/mot-de-passe-oublie'));
    }
  }

  // ---------------------------------------------------------------- vérification de l'adresse

  async verifierEmail(jeton: string): Promise<void> {
    const l = await this.exigerJetonValable(jeton, 'verification_email');
    await this.base.transaction(async (tx) => {
      await this.consommer(tx, l.id);
      await tx.requete(`UPDATE prive.utilisateur SET email_verifie_le = coalesce(email_verifie_le, now()) WHERE id = $1`, [
        l.utilisateur_id,
      ]);
    });
  }

  /** Nouveau lien, pour le compte connecté ou celui d'un lien expiré. Réponse toujours identique. */
  async renvoyerLien(dto: RenvoiLienDto, compte: CompteConnecte | undefined, ip: string): Promise<void> {
    this.limiteurs.exiger([this.limiteurs.envoisIp, ip]);
    this.limiteurs.envoisIp.enregistrer(ip);
    let cible: { id: string; email: string; verifie: boolean } | undefined;
    if (compte) {
      cible = { id: compte.id, email: compte.email, verifie: compte.emailVerifie };
    } else if (dto.jetonExpire) {
      const l = await this.lireJeton(dto.jetonExpire, 'verification_email');
      if (l) cible = { id: l.utilisateur_id, email: l.email, verifie: l.email_verifie };
    }
    if (!cible || cible.verifie || this.limiteurs.envoisEmail.estBloque(cleEmail(cible.email))) return;
    this.limiteurs.envoisEmail.enregistrer(cleEmail(cible.email));
    const nouveau = await this.base.transaction((tx) => this.creerJeton(tx, cible.id, 'verification_email'));
    await this.emails.envoyer('verification_email', cible.id, cible.email, dto.langue ?? 'fr', this.lien('/compte/verification-email', nouveau));
  }

  // ---------------------------------------------------------------- connexion

  async connecter(dto: ConnexionDto, ip: string): Promise<{ jeton: string; csrf: string; expireLe: Date; utilisateur: UtilisateurReponse }> {
    const email = cleEmail(dto.email);
    const [u] = await this.base.requete<{ id: string; uuid: string; mot_de_passe_hache: string }>(
      `SELECT id, uuid, mot_de_passe_hache FROM prive.utilisateur WHERE lower(email) = $1`,
      [email],
    );

    const { connexionEmail, connexionIp } = this.limiteurs;
    if (connexionEmail.estBloque(email) || connexionIp.estBloque(ip)) {
      await this.audit.ecrire(null, 'connexion_echouee', 'utilisateur', u?.uuid ?? 'inconnu', { motif: 'limite_atteinte' });
      this.limiteurs.exiger([connexionEmail, email], [connexionIp, ip]);
    }

    const valable = u ? await this.mdp.verifier(u.mot_de_passe_hache, dto.motDePasse) : await this.mdp.verifierFactice(dto.motDePasse);
    if (!u || !valable) {
      connexionEmail.enregistrer(email);
      connexionIp.enregistrer(ip);
      await this.audit.ecrire(null, 'connexion_echouee', 'utilisateur', u?.uuid ?? 'inconnu', {
        motif: u ? 'mot_de_passe' : 'compte_inconnu',
      });
      throw new ErreurApi(401, 'identifiants');
    }

    connexionEmail.effacer(email);
    if (this.mdp.doitRecalculer(u.mot_de_passe_hache)) {
      await this.base.requete(`UPDATE prive.utilisateur SET mot_de_passe_hache = $2 WHERE id = $1`, [
        u.id,
        await this.mdp.hacher(dto.motDePasse),
      ]);
    }
    const session = await this.sessions.ouvrir(u.id);
    await this.audit.ecrire(u.id, 'connexion_reussie', 'utilisateur', u.uuid);
    return { ...session, utilisateur: await this.utilisateur(u.id) };
  }

  // ---------------------------------------------------------------- compte connecté

  /** Forme du modèle Utilisateur du front-end. */
  async utilisateur(id: string): Promise<UtilisateurReponse> {
    const [u] = await this.base.requete<{
      uuid: string; email: string; role: Role; email_verifie: boolean; suspendu: boolean; pharmacie_uuid: string | null;
    }>(
      `SELECT u.uuid, u.email, u.role, u.email_verifie_le IS NOT NULL AS email_verifie, u.suspendu,
              (SELECT p.uuid FROM prive.rattachement_pharmacien r JOIN annuaire.pharmacie p ON p.id = r.pharmacie_id
                WHERE r.utilisateur_id = u.id AND r.statut = 'validee') AS pharmacie_uuid
         FROM prive.utilisateur u WHERE u.id = $1`,
      [id],
    );
    if (!u) throw new ErreurApi(401, 'non-connecte');
    const reponse: UtilisateurReponse = { id: u.uuid, email: u.email, role: u.role, emailVerifie: u.email_verifie };
    if (u.role === 'pharmacien') {
      reponse.compteVerifie = u.pharmacie_uuid !== null;
      if (u.pharmacie_uuid) reponse.pharmacieId = u.pharmacie_uuid;
    }
    if (u.role === 'pharmacien' || u.suspendu) reponse.suspendu = u.suspendu;
    return reponse;
  }

  /** Change le mot de passe et ferme toutes les sessions du compte, celle-ci comprise. */
  async changerMotDePasse(compte: CompteConnecte, dto: ChangementMotDePasseDto): Promise<void> {
    const cle = cleEmail(compte.email);
    this.limiteurs.exiger([this.limiteurs.connexionEmail, cle]);
    const [u] = await this.base.requete<{ mot_de_passe_hache: string }>(
      `SELECT mot_de_passe_hache FROM prive.utilisateur WHERE id = $1`,
      [compte.id],
    );
    if (!u || !(await this.mdp.verifier(u.mot_de_passe_hache, dto.motDePasseActuel))) {
      this.limiteurs.connexionEmail.enregistrer(cle);
      throw new ErreurApi(400, 'mot-de-passe-actuel');
    }
    const motif = this.mdp.verifierPolitique(dto.nouveauMotDePasse, compte.email);
    if (motif) throw new ErreurApi(400, 'mot-de-passe-faible', { motif });
    const hache = await this.mdp.hacher(dto.nouveauMotDePasse);
    await this.base.transaction(async (tx) => {
      await tx.requete(`UPDATE prive.utilisateur SET mot_de_passe_hache = $2 WHERE id = $1`, [compte.id, hache]);
      await this.sessions.fermerToutes(compte.id, tx);
      await this.audit.ecrire(compte.id, 'changer_mot_de_passe', 'utilisateur', compte.uuid, {}, tx);
    });
  }

  // ---------------------------------------------------------------- mot de passe oublié

  /**
   * Réponse immédiate et identique, que l'adresse existe ou non ; le travail (jeton, e-mail)
   * se fait après la réponse, pour que la durée de réponse ne révèle rien non plus.
   */
  motDePasseOublie(dto: MotDePasseOublieDto, ip: string): void {
    const email = cleEmail(dto.email);
    this.limiteurs.exiger([this.limiteurs.envoisIp, ip], [this.limiteurs.envoisEmail, email]);
    this.limiteurs.envoisIp.enregistrer(ip);
    this.limiteurs.envoisEmail.enregistrer(email);
    const travail = (async () => {
      const [u] = await this.base.requete<{ id: string; email: string }>(
        `SELECT id, email FROM prive.utilisateur WHERE lower(email) = $1`,
        [email],
      );
      if (!u) return;
      const jeton = await this.base.transaction((tx) => this.creerJeton(tx, u.id, 'reinitialisation_mot_de_passe'));
      await this.emails.envoyer('reinitialisation_mot_de_passe', u.id, u.email, dto.langue ?? 'fr', this.lien('/compte/mot-de-passe-oublie', jeton));
    })().catch((e: unknown) => this.journal.error(`Mot de passe oublié : ${e instanceof Error ? e.name : 'erreur'}`));
    this.travaux.add(travail);
    void travail.finally(() => this.travaux.delete(travail));
  }

  /** Attend la fin des travaux lancés après réponse (arrêt du serveur, tests). */
  async travauxTermines(): Promise<void> {
    await Promise.all([...this.travaux]);
  }

  /** Nouveau mot de passe par lien : usage unique ; toutes les sessions du compte sont fermées. */
  async reinitialiser(dto: ReinitialisationDto): Promise<void> {
    const l = await this.exigerJetonValable(dto.jeton, 'reinitialisation_mot_de_passe');
    const motif = this.mdp.verifierPolitique(dto.nouveauMotDePasse, l.email);
    if (motif) throw new ErreurApi(400, 'mot-de-passe-faible', { motif });
    const hache = await this.mdp.hacher(dto.nouveauMotDePasse);
    await this.base.transaction(async (tx) => {
      await this.consommer(tx, l.id);
      // Le lien prouve que la personne lit cette boîte : l'adresse est vérifiée du même coup.
      const [u] = await tx.requete<{ uuid: string }>(
        `UPDATE prive.utilisateur SET mot_de_passe_hache = $2, email_verifie_le = coalesce(email_verifie_le, now())
          WHERE id = $1 RETURNING uuid`,
        [l.utilisateur_id, hache],
      );
      await tx.requete(
        `UPDATE prive.jeton SET expire_le = least(expire_le, now())
          WHERE utilisateur_id = $1 AND type = 'reinitialisation_mot_de_passe' AND utilise_le IS NULL`,
        [l.utilisateur_id],
      );
      await this.sessions.fermerToutes(l.utilisateur_id, tx);
      await this.audit.ecrire(l.utilisateur_id, 'reinitialiser_mot_de_passe', 'utilisateur', u.uuid, {}, tx);
    });
    this.limiteurs.connexionEmail.effacer(cleEmail(l.email));
  }
}
