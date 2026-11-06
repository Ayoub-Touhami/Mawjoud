import { connecterAdministrateur, creerPharmacien, expect, test } from './outils';

test.describe('F8 : administration', () => {
  test('un non-administrateur est refusé', async ({ page }) => {
    await creerPharmacien(page, 'kchaou');
    await page.goto('/admin');
    await page.waitForURL('**/acces-refuse');
    await expect(page.getByRole('heading', { name: 'Accès refusé' })).toBeVisible();
  });

  test('valider une réclamation inscrit la pharmacie', async ({ page }) => {
    await connecterAdministrateur(page);
    await page.goto('/admin/reclamations/dem-02');
    await page.getByRole('button', { name: 'Valider', exact: true }).click();
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByText('La décision est enregistrée')).toBeVisible();
    await page.goto('/pharmacie/T005');
    await expect(page.getByText('Inscrite, vérifiée')).toBeVisible();
  });

  test('refuser exige un motif', async ({ page }) => {
    await connecterAdministrateur(page);
    await page.goto('/admin/reclamations/dem-02');
    await page.getByRole('button', { name: 'Refuser' }).first().click();
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByText('Choisissez un motif')).toBeVisible();
    await page.locator('app-champ-motif select').selectOption('informations-incompletes');
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByText('La décision est enregistrée')).toBeVisible();
  });

  test('corriger une fiche se répercute côté public', async ({ page }) => {
    await connecterAdministrateur(page);
    await page.goto('/admin/annuaire/T006');
    await page.getByLabel('Adresse').first().fill('Adresse corrigée 1');
    await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
    await expect(page.getByText('La fiche est enregistrée')).toBeVisible();
    await page.goto('/pharmacie/T006');
    await expect(page.getByText('Adresse corrigée 1')).toBeVisible();
  });

  test('fusionner deux doublons, et l ancienne adresse suit', async ({ page }) => {
    await connecterAdministrateur(page);
    await page.goto('/admin/annuaire/T-DOUBLON');
    await page.locator('app-fusion-fiches select').selectOption('T002');
    await page.getByRole('button', { name: 'Fusionner' }).click();
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.locator('app-fusion-fiches select')).toHaveCount(0);
    await page.goto('/pharmacie/T002');
    await page.waitForURL('**/pharmacie/T-DOUBLON');
  });

  test('retirer une inscription masque les stocks', async ({ page }) => {
    await connecterAdministrateur(page);
    await page.goto('/admin/annuaire/T009');
    await page.getByRole('button', { name: "Retirer l'inscription" }).click();
    await page.locator('app-champ-motif select').selectOption('informations-incompletes');
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.getByRole('button', { name: "Retirer l'inscription" })).toHaveCount(0);
    await page.goto('/pharmacie/T009');
    await expect(page.locator('.stocks')).toHaveCount(0);
  });

  test('chaque action apparaît dans le journal', async ({ page }) => {
    await connecterAdministrateur(page);
    await page.goto('/admin/annuaire/T006');
    await page.getByLabel('Adresse').first().fill('Adresse du journal');
    await page.getByRole('button', { name: 'Enregistrer la fiche' }).click();
    await expect(page.getByText('La fiche est enregistrée')).toBeVisible();
    await page.goto('/admin/journal');
    await expect(page.locator('tbody')).toContainText('Correction');
    await expect(page.locator('tbody')).toContainText('admin@mawjoud.example');
  });
});
