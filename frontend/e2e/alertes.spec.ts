import { Page } from '@playwright/test';
import { expect, MOT_DE_PASSE, test, verifierEmail } from './outils';

async function creerCompteAvecAlerte(page: Page): Promise<void> {
  await page.goto('/alertes/creer?m=M015&zone=Tunis');
  await page.locator('input[type=email]').fill('nom@exemple.tn');
  await page.locator('input[type=password]').fill(MOT_DE_PASSE);
  await page.getByRole('button', { name: 'Créer mon alerte' }).click();
  await verifierEmail(page);
}

test.describe('F9, F10, F12 : compte patient et alertes', () => {
  test('F9 : aucune alerte tant que l adresse n est pas vérifiée', async ({ page }) => {
    await page.goto('/alertes/creer?m=M015');
    await page.locator('input[type=email]').fill('nom@exemple.tn');
    await page.locator('input[type=password]').fill(MOT_DE_PASSE);
    await page.getByRole('button', { name: 'Créer mon alerte' }).click();
    await page.waitForURL('**/compte/verification-email');
    await expect(page.getByText('Aucune alerte ne partira')).toBeVisible();
    await page.goto('/alertes');
    await page.waitForURL('**/compte/verification-email');
  });

  test('F9 : un lien expiré se renvoie', async ({ page }) => {
    await page.goto('/alertes/creer?m=M015');
    await page.locator('input[type=email]').fill('nom@exemple.tn');
    await page.locator('input[type=password]').fill(MOT_DE_PASSE);
    await page.getByRole('button', { name: 'Créer mon alerte' }).click();
    await page.waitForURL('**/compte/verification-email');
    await page.getByRole('button', { name: 'Tester un lien expiré' }).click();
    await expect(page.getByRole('heading', { name: 'Ce lien a expiré' })).toBeVisible();
    await page.getByRole('button', { name: 'Renvoyer le lien' }).click();
    await page.getByRole('link', { name: 'Ouvrir le lien de vérification' }).click();
    await expect(page.getByRole('heading', { name: 'Votre adresse est vérifiée' })).toBeVisible();
  });

  test('F10 : une ville, toutes les villes, doublon, modification, suppression', async ({ page }) => {
    await creerCompteAvecAlerte(page);
    await page.goto('/alertes/creer?m=M015&zone=Tunis');
    await page.getByRole('button', { name: 'Créer mon alerte' }).click();
    await expect(page.getByText('Vous avez déjà cette alerte')).toBeVisible();

    await page.goto('/alertes/creer?m=M016');
    await page.getByText('Toutes les villes').click();
    await page.getByRole('button', { name: 'Créer mon alerte' }).click();
    await expect(page.getByText('Votre alerte est créée')).toBeVisible();

    await page.goto('/alertes');
    await expect(page.locator('.alerte')).toHaveCount(2);
    await page.getByRole('button', { name: /^Modifier l'alerte Levothyrox 50/ }).click();
    await page.locator('.alerte select').selectOption('Sousse');
    await page.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('.alerte').filter({ hasText: 'Sousse' })).toBeVisible();

    await page.getByRole('button', { name: /^Supprimer l'alerte Levothyrox 50/ }).click();
    await expect(page.locator('.alerte')).toHaveCount(2);
    await page.getByRole('button', { name: 'Oui, supprimer' }).click();
    await expect(page.locator('.alerte')).toHaveCount(1);
  });

  test('F11 : gabarit de l e-mail, en français et en arabe', async ({ page }) => {
    await page.goto('/apercu-email');
    const gabarit = page.locator('app-gabarit-email');
    await expect(gabarit).toContainText('Levothyrox 50 µg est signalé disponible à Tunis');
    await expect(gabarit).toContainText('Déclaré par la pharmacie · il y a 2 h');
    await expect(gabarit).toContainText('Le stock peut changer vite.');
    await expect(gabarit).toContainText('Cette alerte est maintenant terminée');
    await expect(gabarit).toContainText('قد يتغيّر المخزون بسرعة');
    await expect(gabarit.locator('.corps[dir=rtl]')).toHaveCount(1);
    await expect(gabarit.getByRole('link', { name: 'Se désabonner' })).toBeVisible();
    await expect(gabarit.getByRole('link', { name: 'Supprimer mon compte' })).toBeVisible();
  });

  test('F12 : désabonnement sans connexion, puis suppression du compte', async ({ page }) => {
    await creerCompteAvecAlerte(page);
    const jeton = await page.evaluate(
      () =>
        (JSON.parse(localStorage.getItem('mawjoud.simulation') as string).comptes as {
          email: string;
          jetonDesabonnement: string;
        }[]).find((c) => c.email === 'nom@exemple.tn')?.jetonDesabonnement,
    );
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await page.getByRole('button', { name: 'Se déconnecter' }).click();
    await page.goto(`/compte/desabonnement?jeton=${jeton}`);
    await expect(page.getByRole('heading', { name: 'Vous êtes désabonné' })).toBeVisible();

    await page.goto('/compte/suppression');
    await page.waitForURL('**/compte/connexion?retour=**');
    await page.locator('input[type=email]').fill('nom@exemple.tn');
    await page.locator('input[type=password]').fill(MOT_DE_PASSE);
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/compte/suppression');
    await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
    await expect(page.getByRole('heading', { name: 'Votre compte est supprimé' })).toBeVisible();
    const stockage = await page.evaluate(() => localStorage.getItem('mawjoud.simulation'));
    expect(stockage).not.toContain('nom@exemple.tn');
  });
});
