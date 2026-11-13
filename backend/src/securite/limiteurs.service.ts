import { Inject, Injectable } from '@nestjs/common';
import { CONFIGURATION } from '../config/jetons-injection.js';
import type { Configuration } from '../config/configuration.js';
import { ErreurApi } from './erreurs.js';
import { Limiteur } from './limiteur.js';

/** Clé d'adresse e-mail : sans casse ni espaces, pour qu'une variante ne contourne pas la limite. */
export function cleEmail(email: string): string {
  return email.normalize('NFC').trim().toLowerCase();
}

/**
 * Limitation des tentatives (en mémoire du processus).
 * - Connexion : 5 échecs par adresse et 20 échecs par IP en 15 minutes.
 * - Envois d'e-mails (inscription, renvoi de lien, mot de passe oublié) : 10 par IP et 3 par adresse par heure.
 * Les limites s'appliquent de la même façon qu'un compte existe ou non : elles ne révèlent rien.
 */
@Injectable()
export class LimiteursService {
  readonly connexionEmail: Limiteur;
  readonly connexionIp: Limiteur;
  readonly envoisIp: Limiteur;
  readonly envoisEmail: Limiteur;

  constructor(@Inject(CONFIGURATION) config: Configuration) {
    const l = config.limites;
    this.connexionEmail = new Limiteur(l.connexionParEmail);
    this.connexionIp = new Limiteur(l.connexionParIp);
    this.envoisIp = new Limiteur(l.envoisParIp);
    this.envoisEmail = new Limiteur(l.envoisParEmail);
  }

  /** Lève 429 (avec Retry-After) si l'une des clés est bloquée. */
  exiger(...paires: [Limiteur, string][]): void {
    for (const [limiteur, cle] of paires) {
      if (limiteur.estBloque(cle)) {
        throw new ErreurApi(429, 'trop-de-tentatives', { reessayerDans: limiteur.attente(cle) });
      }
    }
  }
}
