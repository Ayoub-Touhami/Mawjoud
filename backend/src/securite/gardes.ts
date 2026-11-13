import { CanActivate, ExecutionContext, Inject, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { CONFIGURATION } from '../config/jetons-injection.js';
import type { Configuration } from '../config/configuration.js';
import { CLE_ACCES, CLE_EMAIL_VERIFIE, CLE_SUSPENDU_AUTORISE, type Acces, type RequeteMawjoud } from './acces-cles.js';
import { prolongerCookie } from './cookies.js';
import { ErreurApi } from './erreurs.js';
import { SessionsService, type Role } from './sessions.service.js';

const METHODES_SURES = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Garde global, appliqué à toutes les routes avant les gardes de rôle :
 * 1. refus par défaut : une route sans déclaration d'accès est refusée ;
 * 2. charge la session du cookie (si elle existe et n'a pas expiré) ;
 * 3. CSRF pour les méthodes qui modifient : origine autorisée, corps JSON,
 *    et, si une session est ouverte, jeton X-XSRF-TOKEN lié à cette session.
 */
@Injectable()
export class SecuriteGuard implements CanActivate {
  private readonly journal = new Logger('Sécurité');

  constructor(
    private readonly reflecteur: Reflector,
    private readonly sessions: SessionsService,
    @Inject(CONFIGURATION) private readonly config: Configuration,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequeteMawjoud>();
    const res = ctx.switchToHttp().getResponse<Response>();

    const acces = this.reflecteur.getAllAndOverride<Acces | undefined>(CLE_ACCES, [ctx.getHandler(), ctx.getClass()]);
    if (!acces) {
      this.journal.warn(`Route sans déclaration d'accès refusée : ${req.method} ${req.path}`);
      throw new ErreurApi(403, 'acces-refuse');
    }

    const jeton = req.cookies?.[this.config.cookies.session] as string | undefined;
    if (typeof jeton === 'string' && /^[A-Za-z0-9_-]{43}$/.test(jeton)) {
      const session = await this.sessions.lire(jeton);
      if (session) {
        req.session = session;
        req.jetonSession = jeton;
        if (session.prolongee) prolongerCookie(res, this.config, jeton, session.expireLe);
      }
    }

    if (!METHODES_SURES.has(req.method)) {
      const origine = req.headers.origin;
      if (origine !== undefined && !this.config.originesCors.includes(origine)) {
        throw new ErreurApi(403, 'origine-refusee');
      }
      // Un formulaire HTML d'un autre site ne peut pas envoyer de JSON sans contrôle CORS préalable.
      const longueur = Number(req.headers['content-length'] ?? 0);
      if ((longueur > 0 || req.headers['transfer-encoding']) && !req.is('application/json')) {
        throw new ErreurApi(415, 'type-contenu');
      }
      if (req.session) {
        const recu = req.headers['x-xsrf-token'];
        if (typeof recu !== 'string' || !this.sessions.csrfValide(req.session, recu)) {
          throw new ErreurApi(403, 'csrf');
        }
      }
    }
    return true;
  }
}

/**
 * Base des gardes de rôle : compte connecté, rôle attendu, e-mail vérifié si la route l'exige,
 * et compte non suspendu sauf si la route l'autorise expressément (refus par défaut).
 */
abstract class GardeRole implements CanActivate {
  protected abstract readonly roles: readonly Role[];

  constructor(protected readonly reflecteur: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<RequeteMawjoud>();
    const compte = req.session?.compte;
    if (!compte) throw new ErreurApi(401, 'non-connecte');
    if (!this.roles.includes(compte.role)) throw new ErreurApi(403, 'acces-refuse');
    const exigeVerifie = this.reflecteur.getAllAndOverride<boolean>(CLE_EMAIL_VERIFIE, [ctx.getHandler(), ctx.getClass()]);
    if (exigeVerifie && !compte.emailVerifie) throw new ErreurApi(403, 'email-non-verifie');
    const suspenduAutorise = this.reflecteur.getAllAndOverride<boolean>(CLE_SUSPENDU_AUTORISE, [ctx.getHandler(), ctx.getClass()]);
    if (compte.suspendu && !suspenduAutorise) throw new ErreurApi(403, 'compte-suspendu');
    return true;
  }
}

@Injectable()
export class ConnecteGuard extends GardeRole {
  protected readonly roles = ['patient', 'pharmacien', 'administrateur'] as const;
  constructor(r: Reflector) { super(r); }
}

@Injectable()
export class PatientGuard extends GardeRole {
  protected readonly roles = ['patient'] as const;
  constructor(r: Reflector) { super(r); }
}

/**
 * Un pharmacien suspendu se connecte et voit son état, mais ne fait plus rien d'autre : l'API le
 * refuse, et la base aussi (stock : 014 ; position et rattachement : 027).
 */
@Injectable()
export class PharmacienGuard extends GardeRole {
  protected readonly roles = ['pharmacien'] as const;
  constructor(r: Reflector) { super(r); }
}

/** Un administrateur suspendu perd tout accès à l'administration (@Administrateur n'a pas d'exception). */
@Injectable()
export class AdministrateurGuard extends GardeRole {
  protected readonly roles = ['administrateur'] as const;
  constructor(r: Reflector) { super(r); }
}
