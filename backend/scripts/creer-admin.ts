/**
 * Crée le premier administrateur. Lit ADMIN_EMAIL et ADMIN_MOT_DE_PASSE dans l'environnement :
 * aucun mot de passe n'est écrit en dur, ni affiché. Refuse s'il existe déjà un administrateur.
 * Usage (PowerShell, dans backend) : voir docs/API_COMPTES.md, « Premier administrateur ».
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module.js';
import { AuditService } from '../src/audit/audit.service.js';
import { BaseService } from '../src/base/base.service.js';
import { creerAdministrateur } from '../src/comptes/administrateur.js';
import { chargerFichierEnv, lireConfiguration } from '../src/config/configuration.js';
import { MotsDePasseService } from '../src/securite/mots-de-passe.service.js';

const MESSAGES: Record<string, string> = {
  'deja-present': 'Cet administrateur existe déjà : rien à faire.',
  'administrateur-existe': 'Un administrateur existe déjà : ce script ne crée que le premier.',
  'email-pris': 'Cette adresse appartient déjà à un compte patient ou pharmacien : refusé (jamais de promotion).',
  'email-invalide': 'ADMIN_EMAIL n\'est pas une adresse valide.',
};

async function principal(): Promise<number> {
  chargerFichierEnv();
  const email = process.env.ADMIN_EMAIL;
  const motDePasse = process.env.ADMIN_MOT_DE_PASSE;
  if (!email || !motDePasse) {
    console.error('ADMIN_EMAIL et ADMIN_MOT_DE_PASSE doivent être définis dans l\'environnement.');
    return 1;
  }
  const config = lireConfiguration();
  const contexte = await NestFactory.createApplicationContext(AppModule.avec(config), { logger: ['error'] });
  try {
    const r = await creerAdministrateur(
      contexte.get(BaseService),
      contexte.get(MotsDePasseService),
      contexte.get(AuditService),
      email,
      motDePasse,
      { premierSeulement: true },
    );
    if (r.resultat === 'cree') {
      console.log(`Administrateur créé (identifiant ${r.uuid}). Effacez ADMIN_MOT_DE_PASSE de la session.`);
      return 0;
    }
    if (r.resultat === 'mot-de-passe-faible') {
      console.error(`Mot de passe refusé (${r.motif}) : 10 à 128 caractères, ni courant, ni égal à l'adresse.`);
      return 1;
    }
    console.error(MESSAGES[r.resultat]);
    return r.resultat === 'deja-present' ? 0 : 1;
  } finally {
    await contexte.close();
  }
}

principal()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    console.error(`Échec : ${e instanceof Error ? e.message : 'erreur'}`);
    process.exit(1);
  });
