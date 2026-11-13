import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { creerApplication } from './application.js';
import { chargerFichierEnv, lireConfiguration } from './config/configuration.js';

async function demarrer(): Promise<void> {
  chargerFichierEnv();
  const config = lireConfiguration();
  const app = await creerApplication(config);
  await app.listen(config.port, config.hote);
  new Logger('Mawjoud').log(`API prête sur http://${config.hote}:${config.port}/api (${config.environnement}).`);
}

demarrer().catch((e: unknown) => {
  // Message seulement : une erreur de configuration ne contient jamais la chaîne de connexion.
  console.error(`Démarrage impossible : ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
