import { defineConfig } from '@playwright/test';

/**
 * Tests de bout en bout, lancés par `npm run e2e` sur les fichiers déjà compilés, avec le Chrome
 * installé. Le projet « dev » contient les raccourcis de test, « prod » vérifie leur absence.
 */
export default defineConfig({
  testDir: './e2e',
  outputDir: './dist/e2e-resultats',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  reporter: [['list']],
  use: {
    channel: 'chrome',
    viewport: { width: 390, height: 844 },
    launchOptions: {
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
    },
  },
  projects: [
    {
      name: 'dev',
      testIgnore: /production\.spec\.ts/,
      use: { baseURL: 'http://127.0.0.1:4310' },
    },
    {
      name: 'prod',
      testMatch: /production\.spec\.ts/,
      use: { baseURL: 'http://127.0.0.1:4311' },
    },
  ],
  webServer: [
    {
      command: 'node e2e/serveur-statique.mjs dist/dev/browser 4310',
      url: 'http://127.0.0.1:4310',
      reuseExistingServer: true,
    },
    {
      command: 'node e2e/serveur-statique.mjs dist/mawjoud/browser 4311',
      url: 'http://127.0.0.1:4311',
      reuseExistingServer: true,
    },
  ],
});
