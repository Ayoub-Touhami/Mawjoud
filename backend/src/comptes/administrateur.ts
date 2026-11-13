import type { AuditService } from '../audit/audit.service.js';
import type { BaseService } from '../base/base.service.js';
import { cleEmail } from '../securite/limiteurs.service.js';
import type { MotifRefus, MotsDePasseService } from '../securite/mots-de-passe.service.js';

export type ResultatAdministrateur =
  | { resultat: 'cree'; uuid: string }
  | { resultat: 'deja-present' }
  | { resultat: 'administrateur-existe' }
  | { resultat: 'email-pris' }
  | { resultat: 'email-invalide' }
  | { resultat: 'mot-de-passe-faible'; motif: MotifRefus };

const FORMAT_EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/**
 * Crée un administrateur (adresse considérée comme vérifiée). Avec `premierSeulement`, refuse
 * s'il existe déjà un administrateur : le script de démarrage ne sert qu'au premier.
 * Ne promeut jamais un compte existant.
 */
export async function creerAdministrateur(
  base: BaseService,
  mdp: MotsDePasseService,
  audit: AuditService,
  emailBrut: string,
  motDePasse: string,
  options: { premierSeulement: boolean },
): Promise<ResultatAdministrateur> {
  const email = cleEmail(emailBrut);
  if (email.length > 254 || !FORMAT_EMAIL.test(email)) return { resultat: 'email-invalide' };
  const motif = mdp.verifierPolitique(motDePasse, email);
  if (motif) return { resultat: 'mot-de-passe-faible', motif };
  const hache = await mdp.hacher(motDePasse);

  return base.transaction(async (tx) => {
    // Un seul script à la fois : verrou de transaction sur une clé propre à cette opération.
    await tx.requete(`SELECT pg_advisory_xact_lock(hashtext('mawjoud:creer-administrateur'))`);
    const [existant] = await tx.requete<{ role: string }>(`SELECT role FROM prive.utilisateur WHERE lower(email) = $1`, [email]);
    if (existant) return existant.role === 'administrateur' ? { resultat: 'deja-present' } : { resultat: 'email-pris' };
    if (options.premierSeulement) {
      const [n] = await tx.requete<{ n: number }>(`SELECT count(*)::int AS n FROM prive.utilisateur WHERE role = 'administrateur'`);
      if (n.n > 0) return { resultat: 'administrateur-existe' };
    }
    const [u] = await tx.requete<{ id: string; uuid: string }>(
      `INSERT INTO prive.utilisateur (email, mot_de_passe_hache, role, email_verifie_le)
       VALUES ($1, $2, 'administrateur', now()) RETURNING id, uuid`,
      [email, hache],
    );
    await audit.ecrire(null, 'creer_administrateur', 'utilisateur', u.uuid, { origine: 'script' }, tx);
    return { resultat: 'cree', uuid: u.uuid };
  });
}
