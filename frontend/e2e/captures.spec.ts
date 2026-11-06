import { auditer, creerPharmacien, expect, test, validerPharmacien } from './outils';

/**
 * Captures de comparaison avec le PDF, seulement avec CAPTURES=1 : elles vont dans un dossier
 * ignoré par Git. Chaque capture passe aussi les mesures automatiques.
 */
const LARGEURS = [
  [360, 780],
  [768, 1024],
  [1280, 860],
] as const;
const THEMES = ['light', 'dark'] as const;
const LANGUES = ['fr', 'ar'] as const;

test.skip(!process.env['CAPTURES'], 'Captures à la demande : CAPTURES=1');

for (const langue of LANGUES) {
  for (const theme of THEMES) {
    for (const [largeur, hauteur] of LARGEURS) {
      test.describe(`${langue} ${theme} ${largeur}`, () => {
        test.use({
          langue,
          colorScheme: theme,
          viewport: { width: largeur, height: hauteur },
          tuilesReelles: true,
        });

        test('écrans', async ({ page }) => {
          const nom = `${langue}-${theme}-${largeur}`;
          const prendre = async (ecran: string) => {
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(600);
            await page.screenshot({
              path: `dist/captures/${ecran}-${nom}.png`,
              fullPage: true,
            });
            const mesure = await auditer(page);
            console.log(ecran, nom, JSON.stringify(mesure));
            expect.soft(mesure.debordement, `${ecran} déborde`).toBe(false);
          };
          await page.goto('/');
          await page.locator('canvas.maplibregl-canvas').waitFor();
          await page.waitForTimeout(1500);
          await prendre('carte');
          await page.goto('/resultats?m=M015');
          await page.locator('app-carte-resultat').first().waitFor();
          await page.waitForTimeout(1200);
          await prendre('resultats');
          await page.goto('/pharmacie/T001');
          await page.locator('app-mini-carte canvas').waitFor();
          await page.waitForTimeout(1200);
          await prendre('fiche');
          await page.goto('/alertes/creer?m=M015');
          await prendre('alerte');
          await page.goto('/apercu-email');
          await prendre('email');
          await creerPharmacien(page, 'kchaou');
          await validerPharmacien(page);
          await prendre('espace');
        });
      });
    }
  }
}
