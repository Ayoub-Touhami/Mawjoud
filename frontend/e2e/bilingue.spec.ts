import { auditer, connecterAdministrateur, expect, test } from './outils';

const ECRANS = [
  ['/', 'خريطة الصيدليات'],
  ['/resultats?m=M015', 'النتائج'],
  ['/pharmacie/T001', 'بطاقة الصيدلية'],
  ['/alertes/creer?m=M015', 'إنشاء تنبيه'],
  ['/compte/connexion', 'تسجيل الدخول'],
  ['/compte/verification-email', 'التحقق'],
  ['/pharmacien/inscription', ''],
  ['/a-propos', ''],
  ['/contact', ''],
  ['/adresse-inconnue', ''],
] as const;

test.describe('F13 : français et arabe', () => {
  test('le sélecteur change la langue, le sens et le titre, et se souvient', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    const titre = await page.title();

    await page.getByRole('button', { name: 'Afficher le site en arabe' }).first().click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect.poll(() => page.title()).not.toBe(titre);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  });

  test.describe('en arabe', () => {
    test.use({ langue: 'ar' });

    for (const [adresse] of ECRANS) {
      test(`${adresse} : sens, langue et aucune clé brute`, async ({ page }) => {
        await page.goto(adresse);
        await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        await page.waitForTimeout(300);
        const texte = await page.locator('body').innerText();
        expect(texte).not.toMatch(/\b(carte|fiche|compte|alertes|recherche|pharmacien)\.[a-zA-Z]+/);
        expect((await auditer(page)).debordement).toBe(false);
      });
    }

    test('une durée suit les pluriels arabes', async ({ page }) => {
      await page.goto('/resultats?m=M015');
      await page.locator('app-carte-resultat').first().waitFor();
      const texte = await page.locator('section.corps').innerText();
      expect(texte).toMatch(/منذ (ساعتين|\d+ ساعات|\d+ ساعة|\d+ دقيقة|يومين)/);
      expect(texte).not.toMatch(/منذ \d+ س\b/);
    });

    test('la flèche de retour pointe vers le début de la lecture', async ({ page }) => {
      await page.goto('/pharmacie/T001');
      await expect(page.locator('a.retour app-icone')).toHaveCSS('transform', /matrix\(-1/);
    });

    test('les commandes de la carte passent de l autre côté', async ({ page }) => {
      await page.goto('/');
      const commandes = await page.locator('.commandes').boundingBox();
      expect((commandes?.x ?? 999) < 195).toBe(true);
      await page.getByRole('button', { name: 'تكبير', exact: true }).click();
    });

    test('l administration reste en français, de gauche à droite', async ({ page }) => {
      await connecterAdministrateur(page);
      await expect(page.locator('.admin')).toHaveCSS('direction', 'ltr');
      await expect(page.getByRole('heading', { name: 'Tableau de bord' })).toBeVisible();
    });
  });
});
