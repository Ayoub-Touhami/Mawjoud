import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Jeton aléatoire de 256 bits, en base64url (43 caractères) : identifiant de session, lien d'e-mail, CSRF. */
export function genererJeton(): string {
  return randomBytes(32).toString('base64url');
}

export const FORMAT_JETON = /^[A-Za-z0-9_-]{43}$/;

/** Empreinte SHA-256 (32 octets) : seule forme stockée en base. */
export function empreinte(jeton: string): Buffer {
  return createHash('sha256').update(jeton, 'utf8').digest();
}

/** Comparaison en temps constant de deux empreintes. */
export function egalEnTempsConstant(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}
