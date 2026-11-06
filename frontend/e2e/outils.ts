import { expect, Page, test as base } from '@playwright/test';

/** Réponse vide : les tests ne dépendent pas d'OpenFreeMap, sauf le test de fluidité. */
async function remplacerTuiles(page: Page): Promise<void> {
  await page.route('**/tiles.openfreemap.org/**', (route) => {
    if (route.request().url().endsWith('/planet')) {
      return route.fulfill({
        json: {
          tilejson: '3.0.0',
          tiles: ['https://tiles.openfreemap.org/t/{z}/{x}/{y}.pbf'],
          maxzoom: 14,
          attribution: 'OpenFreeMap',
        },
      });
    }
    return route.fulfill({ status: 204 });
  });
}

interface Fixtures {
  erreurs: string[];
  tuilesReelles: boolean;
  langue: 'fr' | 'ar';
}

/** Échoue si la console affiche une erreur ou un avertissement. */
export const test = base.extend<Fixtures>({
  tuilesReelles: [false, { option: true }],
  langue: ['fr', { option: true }],
  erreurs: [
    async ({ page, tuilesReelles, langue }, utiliser) => {
      const erreurs: string[] = [];
      page.on('console', (message) => {
        if (['error', 'warning'].includes(message.type())) {
          erreurs.push(message.text());
        }
      });
      page.on('pageerror', (erreur) => erreurs.push(String(erreur)));
      await page.addInitScript((l) => {
        if (!localStorage.getItem('mawjoud.langue')) {
          localStorage.setItem('mawjoud.langue', l);
        }
      }, langue);
      if (!tuilesReelles) {
        await remplacerTuiles(page);
      }
      await utiliser(erreurs);
      expect(erreurs, 'console sans erreur').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const MOT_DE_PASSE = 'mot-de-passe-test';

/** Ouvre le lien de test qui remplace l'e-mail de vérification. */
export async function verifierEmail(page: Page): Promise<void> {
  await page.waitForURL('**/compte/verification-email');
  await page.locator('app-lien-test-email a').click();
  await page.locator('.signe.succes').waitFor();
}

export async function creerPharmacien(page: Page, recherche: string): Promise<void> {
  await page.goto('/pharmacien/inscription');
  await page.locator('input[type=email]').fill('ph@exemple.tn');
  await page.locator('input[type=password]').fill(MOT_DE_PASSE);
  await page.locator('button[type=submit]').click();
  await verifierEmail(page);
  await page.locator('main a[href="/pharmacien"]').click();
  await page.waitForURL('**/pharmacien/reclamer');
  await page.locator('input[type=search]').fill(recherche);
  await page.locator('.resultats li button').first().click();
  await page.locator('.suite button[type=button]').click();
  await page.waitForURL('**/pharmacien/attente');
}

export async function validerPharmacien(page: Page): Promise<void> {
  await page.locator('main aside.outils button').first().click();
  await page.waitForURL(/\/pharmacien$/);
}

export async function connecterAdministrateur(page: Page): Promise<void> {
  await page.goto('/compte/connexion');
  await page.getByRole('button', { name: /administrateur de test|مشرف تجريبي/ }).click();
  await page.waitForURL('**/admin');
}

export async function ajouterMedicament(page: Page, nom: string): Promise<void> {
  await page.locator('.ajouter').click();
  await page.locator('#recherche-medicament').pressSequentially(nom);
  await page.locator('[role=option]').first().click();
  await expect(page.locator('app-ligne-stock', { hasText: nom }).first()).toBeVisible();
}

/** Mesures communes : aucun débordement, cibles d'au moins 44 px, contraste d'au moins 4,5:1. */
export async function auditer(page: Page): Promise<{
  contraste: number;
  faibles: string[];
  petites: string[];
  debordement: boolean;
}> {
  return page.evaluate(() => {
    const luminance = ([r, g, b]: number[]) => {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const toile = document.createElement('canvas');
    toile.width = toile.height = 1;
    const c = toile.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    const rgba = (couleur: string) => {
      c.clearRect(0, 0, 1, 1);
      c.fillStyle = couleur;
      c.fillRect(0, 0, 1, 1);
      return [...c.getImageData(0, 0, 1, 1).data];
    };
    const fond = (element: Element) => {
      for (let n: Element | null = element; n; n = n.parentElement) {
        const v = rgba(getComputedStyle(n).backgroundColor);
        if (v[3] > 200) {
          return v.slice(0, 3);
        }
      }
      return [255, 255, 255];
    };
    let contraste = 99;
    const faibles = new Set<string>();
    const marcheur = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
      const element = n.parentElement as Element;
      if (
        !n.textContent?.trim() ||
        !element.checkVisibility() ||
        element.closest('option, .visuellement-masque, [aria-disabled="true"], :disabled, .maplibregl-map, script, style, app-motif')
      ) {
        continue;
      }
      const [a, b] = [
        luminance(rgba(getComputedStyle(element).color).slice(0, 3)),
        luminance(fond(element)),
      ].sort((x, y) => y - x);
      const rapport = (a + 0.05) / (b + 0.05);
      contraste = Math.min(contraste, rapport);
      if (rapport < 4.5) {
        faibles.add(`${n.textContent.trim().slice(0, 30)} ${rapport.toFixed(2)}`);
      }
    }
    const petites = new Set<string>();
    for (const element of document.querySelectorAll(
      'main a, main button, main input:not(.visuellement-masque):not([type=checkbox]):not([type=radio]), main select',
    )) {
      if (!element.checkVisibility() || element.closest('.maplibregl-map, .acces-clavier')) {
        continue;
      }
      const { width, height } = element.getBoundingClientRect();
      if (width < 44 || height < 44) {
        petites.add(`${element.tagName} ${(element.textContent ?? '').trim().slice(0, 18)} ${Math.round(width)}x${Math.round(height)}`);
      }
    }
    return {
      contraste: Math.round(contraste * 100) / 100,
      faibles: [...faibles],
      petites: [...petites],
      debordement: document.documentElement.scrollWidth > innerWidth,
    };
  });
}
