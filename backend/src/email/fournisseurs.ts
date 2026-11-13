import { Logger } from '@nestjs/common';

export interface MessageEmail {
  a: string;
  sujet: string;
  texte: string;
  /** Présent sur un e-mail d'alerte : le corps associe l'adresse à un médicament (donnée de santé). */
  sante?: { lienDesabonnement: string };
}

/** Adresse masquée pour les journaux : première lettre et domaine (t***@exemple.tn). */
export function masquerAdresse(adresse: string): string {
  const i = adresse.lastIndexOf('@');
  return i > 0 ? `${adresse[0]}***${adresse.slice(i)}` : '***';
}

/** Interface commune : brancher Brevo en production ne change rien d'autre. */
export interface FournisseurEmail {
  readonly nom: string;
  envoyer(message: MessageEmail): Promise<void>;
}

/**
 * Développement seulement (refusé en production par la configuration) : écrit l'e-mail dans la console du
 * serveur, adresse masquée. Les liens de vérification et de réinitialisation restent lisibles pour développer.
 * E-mail d'alerte : seulement le sujet (sans médicament) et le lien de désinscription, jamais le corps
 * (décision du 13 novembre 2026, Partie 9d).
 */
export class EmailConsole implements FournisseurEmail {
  readonly nom = 'console';
  private readonly journal = new Logger('E-mail (console, développement)');

  async envoyer(m: MessageEmail): Promise<void> {
    const corps = m.sante
      ? `(corps non journalisé : donnée de santé)\nDésinscription : ${m.sante.lienDesabonnement}`
      : m.texte;
    this.journal.log(`À : ${masquerAdresse(m.a)}\nSujet : ${m.sujet}\n\n${corps}\n`);
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
