import { auditer, expect, test } from './outils';

const MESSAGE = 'Le numéro de téléphone de cette pharmacie a changé.';

test.describe('page Contact', () => {
  test('refuse un formulaire incomplet, avec des erreurs en mots', async ({ page }) => {
    await page.goto('/contact');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByText('Saisissez une adresse e-mail valide')).toBeVisible();
    await expect(page.getByText('Choisissez un sujet')).toBeVisible();
    await expect(page.getByText('Écrivez votre message')).toBeVisible();
    await expect(page.locator('input[type=email]')).toBeFocused();
    await page.locator('input[type=email]').fill('nom@exemple.tn');
    await page.locator('select').selectOption('question');
    await page.locator('textarea').fill('Trop bref');
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByText('au moins 10 caractères')).toBeVisible();
  });

  test('envoi simulé, confirmation, sans coordonnées inventées', async ({ page }) => {
    await page.goto('/contact');
    await expect(page.getByText('Adresse e-mail de contact à renseigner')).toBeVisible();
    await expect(page.getByText('aucune information de santé', { exact: false })).toBeVisible();
    await page.locator('input[type=email]').fill('nom@exemple.tn');
    await page.locator('select').selectOption('question');
    await page.locator('textarea').fill(MESSAGE);
    await page.getByRole('button', { name: 'Envoyer le message' }).dblclick();
    await expect(page.getByRole('heading', { name: 'Votre message est enregistré' })).toBeFocused();
    const contacts = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mawjoud.simulation') as string).contacts.length,
    );
    expect(contacts).toBe(1);
  });

  test('un échec d envoi propose de réessayer', async ({ page, context }) => {
    await page.goto('/contact');
    await page.locator('input[type=email]').fill('nom@exemple.tn');
    await page.locator('select').selectOption('autre');
    await page.locator('textarea').fill(MESSAGE);
    await context.setOffline(true);
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByText("Votre message n'a pas pu être envoyé")).toBeVisible();
    await context.setOffline(false);
    await page.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.getByRole('heading', { name: 'Votre message est enregistré' })).toBeVisible();
  });

  test('le lien de la fiche préremplit le sujet et la pharmacie', async ({ page }) => {
    await page.goto('/pharmacie/T001');
    await page.getByRole('link', { name: 'Signaler une erreur sur cette pharmacie' }).click();
    await page.waitForURL('**/contact?**');
    await expect(page.locator('select')).toHaveValue('erreur-pharmacie');
    await expect(page.locator('.pharmacie')).toContainText('Pharmacie Test 01');
    await page.locator('input[type=email]').fill('nom@exemple.tn');
    await page.locator('textarea').fill(MESSAGE);
    await page.getByRole('button', { name: 'Envoyer le message' }).click();
    await expect(page.getByRole('heading', { name: 'Votre message est enregistré' })).toBeVisible();
    const envoi = await page.evaluate(
      () => JSON.parse(localStorage.getItem('mawjoud.simulation') as string).contacts[0],
    );
    expect(envoi.pharmacieId).toBe('T001');
  });
});

test.describe('page À propos', () => {
  test('contenu demandé, menu et pied de page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await page.locator('#navigation-principale').getByRole('link', { name: 'À propos' }).click();
    await page.waitForURL('**/a-propos');
    const contenu = page.locator('main');
    await expect(contenu).toContainText('Moins de tours, plus de secours.');
    await expect(contenu).toContainText('Je cherche un médicament');
    await expect(contenu).toContainText("J'appelle avant de me déplacer");
    await expect(contenu).toContainText('Inscrite, stock déclaré');
    await expect(contenu).toContainText('Quantité limitée');
    await expect(contenu).toContainText('ne remplace pas un pharmacien');
    await expect(contenu).toContainText('Aucune donnée de santé');
    await expect(contenu).toContainText('Touhami AYOUB');
    await expect(contenu).toContainText('Dr. Maroua Nouioua');
    await expect(page.locator('main h1')).toHaveCount(1);
    await page.locator('app-pied-de-page').getByRole('link', { name: 'Contact' }).click();
    await page.waitForURL('**/contact');
  });

  for (const langue of ['fr', 'ar'] as const) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test.describe(`${langue} ${colorScheme}`, () => {
        test.use({ langue, colorScheme });

        test('sens, contraste et cibles', async ({ page }) => {
          for (const adresse of ['/a-propos', '/contact']) {
            await page.goto(adresse);
            await page.locator('main h1').waitFor();
            await expect(page.locator('html')).toHaveAttribute(
              'dir',
              langue === 'ar' ? 'rtl' : 'ltr',
            );
            await page.waitForTimeout(200);
            const mesure = await auditer(page);
            expect(mesure.faibles, adresse).toEqual([]);
            expect(mesure.petites, adresse).toEqual([]);
            expect(mesure.debordement, adresse).toBe(false);
          }
        });
      });
    }
  }

  test.describe('largeur de l en-tête', () => {
    test.use({ viewport: { width: 880, height: 700 }, langue: 'ar' });

    test('les liens tiennent juste au-dessus du seuil mobile', async ({ page }) => {
      await page.goto('/a-propos');
      await page.locator('main h1').waitFor();
      expect((await auditer(page)).debordement).toBe(false);
    });
  });
});
