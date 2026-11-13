import { ArgumentsHost, BadRequestException, Catch, ExceptionFilter, HttpException, Logger, ValidationError, ValidationPipe } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ErreurApi } from './erreurs.js';

/** Chemins des champs refusés, sans jamais leur valeur (un mot de passe ne doit pas revenir). */
function champs(erreurs: ValidationError[], parent = ''): string[] {
  return erreurs.flatMap((e) => {
    const chemin = parent ? `${parent}.${e.property}` : e.property;
    return e.children?.length ? champs(e.children, chemin) : [chemin];
  });
}

/** Validation stricte des entrées : champs inconnus refusés, types contrôlés, aucune valeur dans l'erreur. */
export function creerValidation(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    validationError: { target: false, value: false },
    exceptionFactory: (erreurs) => new ErreurApi(400, 'donnees-invalides', { champs: champs(erreurs) }),
  });
}

/**
 * Toutes les erreurs passent ici. La réponse ne contient qu'un code ; le journal ne garde que
 * le nom, le code SQL et la contrainte : jamais le corps de la requête, ni le « DETAIL » de
 * PostgreSQL (qui peut recopier toute une ligne, empreinte de mot de passe comprise).
 */
@Catch()
export class FiltreErreurs implements ExceptionFilter {
  private readonly journal = new Logger('Erreurs');

  catch(erreur: unknown, hote: ArgumentsHost): void {
    const ctx = hote.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (erreur instanceof ErreurApi) {
      const corps = erreur.getResponse() as { reessayerDans?: number };
      if (erreur.getStatus() === 429 && corps.reessayerDans) res.setHeader('Retry-After', String(corps.reessayerDans));
      res.status(erreur.getStatus()).json(corps);
      return;
    }
    if (erreur instanceof HttpException) {
      const statut = erreur.getStatus();
      // JSON mal formé, corps trop gros, route inconnue… : code générique, sans recopier l'entrée.
      const code =
        erreur instanceof BadRequestException ? 'json-invalide'
        : statut === 404 ? 'introuvable'
        : statut === 413 ? 'donnees-invalides'
        : statut === 401 ? 'non-connecte'
        : statut === 403 ? 'acces-refuse'
        : statut === 429 ? 'trop-de-tentatives'
        : 'erreur-interne';
      res.status(statut).json({ erreur: code });
      return;
    }
    // Erreur du corps de requête levée par Express (taille, JSON) avant NestJS.
    const e = erreur as { status?: number; type?: string; name?: string; code?: string; constraint?: string };
    if (typeof e?.status === 'number' && e.status >= 400 && e.status < 500) {
      res.status(e.status).json({ erreur: e.status === 413 ? 'donnees-invalides' : 'json-invalide' });
      return;
    }
    this.journal.error(
      `${req.method} ${req.path} : ${e?.name ?? 'Erreur'}` +
        (e?.code ? ` (code ${e.code}${e.constraint ? `, contrainte ${e.constraint}` : ''})` : ''),
    );
    res.status(500).json({ erreur: 'erreur-interne' });
  }
}
