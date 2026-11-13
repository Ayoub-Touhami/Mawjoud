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
import {
  LimitePubliqueGuard,
  MedicamentsPublicsController,
  PharmaciesPubliquesController,
  ReferentielsPublicsController,
} from './publique/publique.controller.js';
import { PubliqueService } from './publique/publique.service.js';
import { EspacePharmacienController, LimitePharmacienGuard } from './pharmacien/pharmacien.controller.js';
import { PharmacienService } from './pharmacien/pharmacien.service.js';
import { AdministrationController, LimiteAdminGuard } from './administration/administration.controller.js';
import { AdministrationService } from './administration/administration.service.js';
import { AdministrationGeneraleController } from './administration/administration-generale.controller.js';
import { AdministrationGeneraleService } from './administration/administration-generale.service.js';
import { AlertesController, LimiteAlertesGuard } from './alertes/alertes.controller.js';
import { AlertesService } from './alertes/alertes.service.js';
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
 * Comptes et authentification (Partie 5) ; recherche et carte, API publique en lecture (Partie 6).
 * Espace pharmacien (Partie 7) ; positions, validation et publication (Partie 8) ; alertes et rappels (Partie 9b) ;
 * administration générale (Partie 9c).
 * `controleursEnPlus` sert aux tests (route sans déclaration d'accès, pour vérifier le refus par défaut).
 */
@Module({})
export class AppModule {
  static avec(config: Configuration, controleursEnPlus: Type[] = []): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        ComptesController,
        RattachementPharmacienController,
        RattachementAdminController,
        PharmaciesPubliquesController,
        MedicamentsPublicsController,
        ReferentielsPublicsController,
        EspacePharmacienController,
        AdministrationController,
        AdministrationGeneraleController,
        AlertesController,
        ...controleursEnPlus,
      ],
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
        PubliqueService,
        LimitePubliqueGuard,
        PharmacienService,
        LimitePharmacienGuard,
        AdministrationService,
        AdministrationGeneraleService,
        LimiteAdminGuard,
        AlertesService,
        LimiteAlertesGuard,
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
