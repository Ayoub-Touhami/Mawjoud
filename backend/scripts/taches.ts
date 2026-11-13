/**
 * Tâche planifiée de Mawjoud (Partie 9b) : rappels aux pharmacies, envoi des e-mails en attente
 * (alertes et rappels, avec nouveaux essais), purge des alertes déclenchées depuis plus de 30 jours.
 *
 * Une exécution fait une passe puis s'arrête. À lancer régulièrement (toutes les heures, par exemple)
 * par le planificateur du système : aucun service externe. Voir docs/API_ALERTES.md, « Tâche planifiée ».
 * N'affiche que des nombres : ni adresse, ni médicament.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AlertesService } from '../src/alertes/alertes.service.js';
import { AppModule } from '../src/app.module.js';
import { chargerFichierEnv, lireConfiguration } from '../src/config/configuration.js';

async function principal(): Promise<number> {
  chargerFichierEnv();
  const config = lireConfiguration();
  const contexte = await NestFactory.createApplicationContext(AppModule.avec(config), { logger: ['error', 'warn'] });
  try {
    const debut = Date.now();
    const b = await contexte.get(AlertesService).executerTaches();
    console.log(
      `${new Date().toISOString()} tâches Mawjoud : ${b.rappelsPrepares} rappel(s) préparé(s), ${b.envoyes} e-mail(s) envoyé(s), ` +
        `${b.echecs} échec(s) (nouvel essai plus tard), ${b.alertesEffacees} alerte(s) effacée(s) ; ${Date.now() - debut} ms.`,
    );
    return b.echecs > 0 ? 2 : 0;
  } finally {
    await contexte.close();
  }
}

principal()
  .then((code) => process.exit(code))
  .catch((e: unknown) => {
    console.error(`Tâches Mawjoud : échec (${e instanceof Error ? e.message : 'erreur'}).`);
    process.exit(1);
  });
