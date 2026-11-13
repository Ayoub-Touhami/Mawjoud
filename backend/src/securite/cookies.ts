import type { CookieOptions, Response } from 'express';
import type { Configuration } from '../config/configuration.js';

/**
 * Cookie de session : HttpOnly (illisible par JavaScript), SameSite=Strict, Secure en production.
 * Cookie XSRF-TOKEN : lisible par le front-end, qui le renvoie dans l'en-tête X-XSRF-TOKEN.
 */
function options(config: Configuration, httpOnly: boolean, expireLe?: Date): CookieOptions {
  return {
    httpOnly,
    secure: config.cookies.securise,
    sameSite: 'strict',
    path: '/',
    ...(expireLe ? { expires: expireLe } : {}),
  };
}

export function poserCookies(res: Response, config: Configuration, jeton: string, csrf: string | null, expireLe: Date): void {
  res.cookie(config.cookies.session, jeton, options(config, true, expireLe));
  if (csrf) res.cookie(config.cookies.csrf, csrf, options(config, false, expireLe));
}

/** Prolonge le cookie de session sans en changer la valeur (expiration glissante). */
export function prolongerCookie(res: Response, config: Configuration, jeton: string, expireLe: Date): void {
  res.cookie(config.cookies.session, jeton, options(config, true, expireLe));
}

export function effacerCookies(res: Response, config: Configuration): void {
  res.clearCookie(config.cookies.session, options(config, true));
  res.clearCookie(config.cookies.csrf, options(config, false));
}
