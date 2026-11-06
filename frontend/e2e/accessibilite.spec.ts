import { auditer, connecterAdministrateur, creerPharmacien, expect, test, validerPharmacien } from './outils';

const PAGES = ['/', '/resultats?m=M015', '/pharmacie/T001', '/alertes/creer?m=M015', '/compte/connexion'];

test.describe('accessibilité et usage', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(colorScheme, () => {
      test.use({ colorScheme });

      test('contraste, cibles et débordement', async ({ page }) => {
        for (const adresse of PAGES) {
          await page.goto(adresse);
          await page.waitForTimeout(400);
          const mesure = await auditer(page);
          expect(mesure.faibles, adresse).toEqual([]);
          expect(mesure.petites, adresse).toEqual([]);
          expect(mesure.debordement, adresse).toBe(false);
        }
      });

      test('espace pharmacien et administration', async ({ page }) => {
        await creerPharmacien(page, 'kchaou');
        await validerPharmacien(page);
        const espace = await auditer(page);
        expect(espace.faibles).toEqual([]);
        await page.evaluate(() => {
          const d = JSON.parse(localStorage.getItem('mawjoud.simulation') as string);
          d.sessionId = null;
          localStorage.setItem('mawjoud.simulation', JSON.stringify(d));
        });
        await connecterAdministrateur(page);
        for (const adresse of ['/admin', '/admin/reclamations', '/admin/annuaire', '/admin/signalements', '/admin/journal']) {
          await page.goto(adresse);
          await page.waitForTimeout(200);
          expect((await auditer(page)).faibles, adresse).toEqual([]);
        }
      });
    });
  }

  test('le clavier atteint le contenu, avec un focus visible', async ({ page }) => {
    await page.goto('/compte/connexion');
    await page.locator('form').waitFor();
    await page.keyboard.press('Tab');
    await expect(page.locator('a.evitement')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    await page.keyboard.press('Tab');
    const style = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement;
      const s = getComputedStyle(element);
      return { balise: element.tagName, contour: s.outlineStyle, parent: element.closest('main') !== null };
    });
    expect(style.parent).toBe(true);
    expect(style.contour === 'none' && style.balise !== 'INPUT').toBe(false);
  });

  test('les boutons de statut se pilotent au clavier', async ({ page }) => {
    await creerPharmacien(page, 'kchaou');
    await validerPharmacien(page);
    await page.locator('.ajouter').focus();
    await page.keyboard.press('Enter');
    await page.locator('#recherche-medicament').pressSequentially('Imodium');
    await page.locator('[role=option]').first().waitFor();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const bouton = page.locator('app-ligne-stock .statuts button').first();
    await bouton.focus();
    await expect(bouton).toHaveCSS('outline-style', 'solid');
    await page.keyboard.press('Enter');
    await expect(page.locator('app-ligne-stock button.actif')).toContainText('Disponible');
    await expect(page.locator('p[role=status]').first()).toContainText('Mise à jour enregistrée');
  });

  test('la carte s utilise sans souris', async ({ page }) => {
    await page.goto('/resultats?m=M015&zone=Sfax');
    await page.locator('app-carte-resultat').first().waitFor();
    await page.locator('app-carte-resultat button').first().focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#titre-feuille')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('app-feuille-pharmacie')).toHaveCount(0);
  });

  test.describe('réduire les animations', () => {
    test.use({ reducedMotion: 'reduce' });

    test('les transitions sont coupées', async ({ page }) => {
      await page.goto('/compte/connexion');
      const duree = await page
        .locator('button[type=submit]')
        .evaluate((e) => parseFloat(getComputedStyle(e).transitionDuration));
      expect(duree).toBeLessThan(0.05);
    });
  });

  test.describe('règle des 3 clics', () => {
    test('chercher, résultat, appeler', async ({ page }) => {
      await page.goto('/');
      await page.locator('#recherche-medicament').pressSequentially('levothyrox');
      await page.locator('[role=option]').first().click();
      await page.locator('app-carte-resultat button').first().click();
      await expect(page.locator('app-feuille-pharmacie a[href^="tel:"]')).toBeVisible();
    });

    test('Mes alertes et la création d alerte en 2 clics au plus', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
      await page.getByRole('link', { name: 'Mes alertes' }).click();
      await page.waitForURL('**/compte/connexion**');
      await page.goto('/resultats?m=M037');
      await page.getByRole('link', { name: 'Créer une alerte' }).first().click();
      await page.waitForURL('**/alertes/creer**');
    });

    test('mettre à jour un stock : un appui depuis l espace', async ({ page }) => {
      await creerPharmacien(page, 'kchaou');
      await validerPharmacien(page);
      await expect(page.locator('.ajouter')).toBeVisible();
    });
  });
});
