import { SujetContact } from '../../core/services/contact.service';

export const MESSAGE_MINIMUM = 10;
export const MESSAGE_MAXIMUM = 2000;

export interface ErreursContact {
  email: string | null;
  sujet: string | null;
  message: string | null;
}

export const AUCUNE_ERREUR: ErreursContact = { email: null, sujet: null, message: null };

/** Renvoie les clés de traduction des erreurs : elles se disent toujours en mots. */
export function validerContact(
  email: string,
  sujet: SujetContact | '',
  message: string,
): ErreursContact {
  const longueur = message.trim().length;
  return {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'compte.erreurs.email',
    sujet: sujet ? null : 'contact.erreurs.sujet',
    message:
      longueur === 0
        ? 'contact.erreurs.messageVide'
        : longueur < MESSAGE_MINIMUM
          ? 'contact.erreurs.messageCourt'
          : longueur > MESSAGE_MAXIMUM
            ? 'contact.erreurs.messageLong'
            : null,
  };
}
