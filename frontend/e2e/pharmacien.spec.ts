import { ajouterMedicament, creerPharmacien, expect, test, validerPharmacien } from './outils';

test.describe('F5, F6, F7 : pharmacien', () => {
  test('F5 : un compte non vérifié ne peut pas déclarer', async ({ page }) => {
    await creerPharmacien(page, 'kchaou');
    await expect(page.getByText("Aucune déclaration de stock n'est possible")).toBeVisible();
    await page.goto('/pharmacien');
    await page.waitForURL('**/pharmacien/attente');
    await page.goto('/pharmacie/T006');
    await expect(page.getByText('Non inscrite')).toBeVisible();
  });

  test('F6 et F7 : un appui, puis « à confirmer », puis retrait de la mention', async ({ page }) => {
    await creerPharmacien(page, 'kchaou');
    await validerPharmacien(page);
    await ajouterMedicament(page, 'Imodium');
    const ligne = page.locator('app-ligne-stock').first();
    await ligne.getByRole('button', { name: /^Disponible/ }).click();
    await expect(ligne.getByText("à l'instant")).toBeVisible();

    await page.goto('/resultats?m=M037');
    await expect(page.locator('app-carte-resultat', { hasText: 'KCHAOU' })).toContainText('Disponible');

    await page.goto('/pharmacien');
    await page.getByRole('button', { name: 'Vieillir les déclarations de 25 h' }).click();
    await expect(ligne.getByText('À confirmer')).toBeVisible();
    await expect(ligne.locator('button.actif')).toContainText('Disponible');

    await page.goto('/resultats?m=M037');
    await expect(page.locator('app-carte-resultat', { hasText: 'KCHAOU' })).toContainText(
      'À confirmer',
    );

    await page.goto('/pharmacien');
    await ligne.getByRole('button', { name: /^Disponible/ }).click();
    await expect(ligne.getByText("à l'instant")).toBeVisible();
    await expect(ligne.locator('.confirmer')).toHaveCount(0);
  });

  test('F6 : une coupure réseau n est jamais perdue en silence', async ({ page, context }) => {
    await creerPharmacien(page, 'kchaou');
    await validerPharmacien(page);
    await ajouterMedicament(page, 'Imodium');
    const ligne = page.locator('app-ligne-stock').first();
    await ligne.getByRole('button', { name: /^Disponible/ }).click();
    await expect(ligne.getByText("à l'instant")).toBeVisible();
    await context.setOffline(true);
    await ligne.getByRole('button', { name: /^En rupture/ }).click();
    await expect(ligne.getByText('Mise à jour non enregistrée')).toBeVisible();
    await expect(ligne.locator('button.actif')).toContainText('Disponible');
    await context.setOffline(false);
    await ligne.getByRole('button', { name: 'Réessayer' }).click();
    await expect(ligne.locator('button.actif')).toContainText('En rupture');
  });
});
