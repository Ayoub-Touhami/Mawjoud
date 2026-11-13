import { Logger, type LogLevel, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import type { Configuration } from './config/configuration.js';
import { refuserEntreesDangereuses } from './securite/entrees.js';
import { creerValidation } from './securite/filtre-erreurs.js';

/**
 * Crée l'application avec toutes ses protections. Utilisée par main.ts et par les tests,
 * pour que les tests vérifient exactement ce qui tourne en vrai.
 */
export async function creerApplication(config: Configuration, controleursEnPlus: Type[] = []): Promise<NestExpressApplication> {
  const niveaux: LogLevel[] = config.environnement === 'test' ? ['error'] : ['log', 'warn', 'error'];
  const app = await NestFactory.create<NestExpressApplication>(AppModule.avec(config, controleursEnPlus), {
    bodyParser: false,
    logger: niveaux,
  });

  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cookieParser());
  // Corps JSON seulement, 10 Ko au plus. Une erreur de lecture renvoie un code, sans recopier l'entrée.
  app.useBodyParser('json', { limit: '10kb', strict: true });
  app.use((erreur: { status?: number }, _req: Request, res: Response, suite: NextFunction) => {
    if (!erreur) return suite();
    const statut = typeof erreur.status === 'number' && erreur.status >= 400 && erreur.status < 500 ? erreur.status : 400;
    res.status(statut).json({ erreur: statut === 413 ? 'donnees-invalides' : 'json-invalide' });
  });
  // Caractère nul et imbrication excessive refusés avant la validation (Partie 9d : erreurs 500 évitées).
  app.use(refuserEntreesDangereuses);

  app.enableCors({
    origin: config.originesCors,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'X-XSRF-TOKEN'],
    maxAge: 600,
  });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(creerValidation());
  app.enableShutdownHooks();

  if (config.environnement === 'development') {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('API Mawjoud : comptes')
        .setDescription('Comptes et authentification. Développement seulement. Voir docs/API_COMPTES.md.')
        .setVersion('0.1.0')
        .addCookieAuth('mawjoud_session')
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document);
    new Logger('Documentation').log('Swagger : /api/docs (développement seulement).');
  }
  return app;
}
