import { expect, test } from './outils';

test.describe('build de production', () => {
  test('les pages de développement sont absentes', async ({ page }) => {
    for (const adresse of ['/design', '/apercu-email']) {
      await page.goto(adresse);
      await expect(page.locator('main h1')).toHaveText('Page introuvable');
    }
  });

  test('aucun raccourci de test sur la connexion ni la vérification', async ({ page }) => {
    await page.goto('/compte/connexion');
    await expect(page.locator('form')).toBeVisible();
    await expect(page.getByRole('button', { name: /administrateur de test/ })).toHaveCount(0);
    await page.goto('/alertes/creer?m=M015');
    await page.locator('input[type=email]').fill('nom@exemple.tn');
    await page.locator('input[type=password]').fill('mot-de-passe-test');
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/compte/verification-email');
    await expect(page.locator('app-lien-test-email aside')).toHaveCount(0);
  });

  test('la mention « données de test » reste visible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('app-bandeau-donnees-test')).toContainText('Données de test');
  });

  test('le code d administration n est pas chargé pour les autres', async ({ page }) => {
    const fichiers: string[] = [];
    page.on('response', async (reponse) => {
      if (reponse.url().endsWith('.js')) {
        fichiers.push(await reponse.text().catch(() => ''));
      }
    });
    await page.goto('/admin');
    await page.waitForURL('**/compte/connexion**');
    await page.goto('/resultats?m=M015');
    await page.locator('app-carte-resultat').first().waitFor();
    expect(fichiers.length).toBeGreaterThan(0);
    expect(fichiers.some((f) => f.includes('app-admin-layout'))).toBe(false);
  });
});
