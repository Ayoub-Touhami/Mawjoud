import { expect, test } from './outils';

test.describe('F1 à F4 : consultation sans compte', () => {
  test('F1 : la carte montre toutes les pharmacies, avec la légende', async ({ page }) => {
    await page.goto('/');
    await page.locator('canvas.maplibregl-canvas').waitFor();
    await expect(page.locator('app-legende-carte')).toContainText('Inscrite, stock déclaré');
    await expect(page.locator('app-legende-carte')).toContainText('Non inscrite, appelez');
    await expect(page.locator('app-bandeau-donnees-test')).toContainText('Données de test');
    await expect(page.locator('.acces-clavier li').first()).toBeAttached();
  });

  test('F2 : une recherche sans compte, avec une faute de frappe', async ({ page }) => {
    await page.goto('/');
    await page.locator('#recherche-medicament').pressSequentially('levotyrox');
    await page.locator('[role=option]').first().click();
    await page.waitForURL('**/resultats?m=M015');
    await expect(page.locator('app-carte-resultat').first()).toBeVisible();
  });

  test('F2 : un médicament introuvable donne un message clair', async ({ page }) => {
    await page.goto('/resultats?q=xyzwqk');
    await expect(page.getByText('Aucun résultat pour')).toBeVisible();
    await expect(page.getByText("Vérifiez l'orthographe du nom.")).toBeVisible();
  });

  test('F2 : une recherche vide explique quoi faire', async ({ page }) => {
    await page.goto('/resultats');
    await expect(page.getByText('Quel médicament cherchez-vous')).toBeVisible();
  });

  test('F3 : statuts en mot, groupes et heure de mise à jour', async ({ page }) => {
    await page.goto('/resultats?m=M015');
    await page.locator('app-carte-resultat').first().waitFor();
    const statuts = await page.locator('app-carte-resultat app-pastille-statut').allInnerTexts();
    for (const statut of ['Disponible', 'Quantité limitée', 'En rupture', 'À confirmer']) {
      expect(statuts).toContain(statut);
    }
    await expect(page.getByRole('heading', { name: /Inscrites : stock déclaré/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Non inscrites/i })).toBeVisible();
    await expect(page.getByText('Stock non renseigné, appelez avant de vous déplacer.').first())
      .toBeVisible();
    await expect(page.getByText(/il y a \d+/).first()).toBeVisible();
  });

  test('F3 : aucune déclaration, l alerte est proposée', async ({ page }) => {
    await page.goto('/resultats?m=M037');
    await expect(page.getByText("Aucune pharmacie inscrite n'a déclaré")).toBeVisible();
    await expect(page.getByRole('link', { name: 'Créer une alerte' }).first()).toBeVisible();
  });

  test('F4 : la fiche donne adresse, téléphone et mention', async ({ page }) => {
    await page.goto('/pharmacie/T001');
    await expect(page.getByText('Inscrite, vérifiée')).toBeVisible();
    await expect(page.getByText('+216 00 000 001')).toBeVisible();
    await expect(page.getByText('Bd de la terre, Raoued')).toBeVisible();
    await expect(page.locator('a[href^="tel:"]')).toBeVisible();
  });

  test('F4 : une pharmacie non inscrite n affiche aucun stock', async ({ page }) => {
    await page.goto('/pharmacie/T006');
    await expect(page.getByText('Stock non renseigné')).toBeVisible();
    await expect(page.locator('.stocks')).toHaveCount(0);
  });
});
