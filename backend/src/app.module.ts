import { DynamicModule, Module, Type } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuditService } from './audit/audit.service.js';
import { BaseService } from './base/base.service.js';
import { ComptesController } from './comptes/comptes.controller.js';
import { ComptesService } from './comptes/comptes.service.js';
import type { Configuration } from './config/configuration.js';
import { CONFIGURATION, FOURNISSEUR_EMAIL } from './config/jetons-injection.js';
import { EmailService } from './email/email.service.js';
import { EmailBrevo, EmailConsole, EmailMemoire, type FournisseurEmail } from './email/fournisseurs.js';
import { RattachementAdminController, RattachementPharmacienController } from './rattachements/rattachements.controller.js';
import { RattachementsService } from './rattachements/rattachements.service.js';
import { FiltreErreurs } from './securite/filtre-erreurs.js';
import { AdministrateurGuard, ConnecteGuard, PatientGuard, PharmacienGuard, SecuriteGuard } from './securite/gardes.js';
import { LimiteursService } from './securite/limiteurs.service.js';
import { MotsDePasseService } from './securite/mots-de-passe.service.js';
import { SessionsService } from './securite/sessions.service.js';

function fournisseurEmail(config: Configuration): FournisseurEmail {
  switch (config.fournisseurEmail) {
    case 'console': return new EmailConsole();
    case 'memoire': return new EmailMemoire();
    case 'brevo': return new EmailBrevo();
  }
}

/**
 * Comptes et authentification (Partie 5). Recherche, stock et alertes viendront aux Parties 6 à 9.
 * `controleursEnPlus` sert aux tests (route sans déclaration d'accès, pour vérifier le refus par défaut).
 */
@Module({})
export class AppModule {
  static avec(config: Configuration, controleursEnPlus: Type[] = []): DynamicModule {
    return {
      module: AppModule,
      controllers: [ComptesController, RattachementPharmacienController, RattachementAdminController, ...controleursEnPlus],
      providers: [
        { provide: CONFIGURATION, useValue: config },
        { provide: FOURNISSEUR_EMAIL, useValue: fournisseurEmail(config) },
        BaseService,
        MotsDePasseService,
        SessionsService,
        LimiteursService,
        EmailService,
        AuditService,
        ComptesService,
        RattachementsService,
        ConnecteGuard,
        PatientGuard,
        PharmacienGuard,
        AdministrateurGuard,
        // Global : refus par défaut, session, CSRF. Les gardes de rôle s'ajoutent route par route.
        { provide: APP_GUARD, useClass: SecuriteGuard },
        { provide: APP_FILTER, useClass: FiltreErreurs },
      ],
    };
  }
}
