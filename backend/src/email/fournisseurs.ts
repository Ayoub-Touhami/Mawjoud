import { Logger } from '@nestjs/common';

export interface MessageEmail {
  a: string;
  sujet: string;
  texte: string;
}

/** Interface commune : brancher Brevo en production ne change rien d'autre. */
export interface FournisseurEmail {
  readonly nom: string;
  envoyer(message: MessageEmail): Promise<void>;
}

/**
 * Développement seulement : écrit l'e-mail dans la console du serveur (lien compris).
 * Refusé en production par la configuration.
 */
export class EmailConsole implements FournisseurEmail {
  readonly nom = 'console';
  private readonly journal = new Logger('E-mail (console, développement)');

  async envoyer(m: MessageEmail): Promise<void> {
    this.journal.log(`À : ${m.a}\nSujet : ${m.sujet}\n\n${m.texte}\n`);
  }
}

/** Tests automatiques : garde les e-mails en mémoire pour y lire les liens. */
export class EmailMemoire implements FournisseurEmail {
  readonly nom = 'memoire';
  readonly envoyes: MessageEmail[] = [];

  async envoyer(m: MessageEmail): Promise<void> {
    this.envoyes.push(m);
  }

  dernierPour(adresse: string): MessageEmail | undefined {
    return [...this.envoyes].reverse().find((m) => m.a.toLowerCase() === adresse.toLowerCase());
  }
}

/**
 * Production : Brevo (API transactionnelle). Interface prête, envoi non réalisé :
 * il faudra la clé d'API (BREVO_CLE_API, dans .env du serveur), un domaine vérifié (SPF, DKIM)
 * et l'adresse d'expédition. Lève une erreur tant que ce n'est pas fait.
 */
export class EmailBrevo implements FournisseurEmail {
  readonly nom = 'brevo';

  async envoyer(_m: MessageEmail): Promise<void> {
    throw new Error('Envoi Brevo non réalisé.');
  }
}
