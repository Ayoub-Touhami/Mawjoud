import { CDPSession } from '@playwright/test';
import { expect, test } from './outils';

test.use({ tuilesReelles: true });

/** 3 000 marqueurs injectés dans la page seulement. Mesuré sur PC : ce n'est pas un vrai téléphone. */
test('la carte reste fluide avec 3 000 marqueurs', async ({ page, context }) => {
  test.setTimeout(120000);
  await page.goto('/');
  await page.locator('canvas.maplibregl-canvas').waitFor();
  await page.waitForFunction(() => {
    const element = document.querySelector('app-carte-tunisie') as Element;
    const composant = (window as never as { ng: { getComponent(e: Element): { carte?: { loaded(): boolean } } } }).ng.getComponent(element);
    return composant.carte?.loaded();
  });
  const session: CDPSession = await context.newCDPSession(page);
  await session.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const mesure = await page.evaluate(async () => {
    const element = document.querySelector('app-carte-tunisie') as Element;
    const carte = (window as never as { ng: { getComponent(e: Element): { carte: any } } }).ng.getComponent(element).carte;
    const entites = Array.from({ length: 3000 }, (_, i) => {
      const angle = (i * 2.399963) % 6.283;
      const r = Math.sqrt((i + 0.5) / 3000);
      return {
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [9.2 + 1.5 * r * Math.cos(angle), 34.5 + 2.6 * r * Math.sin(angle)],
        },
        properties: { id: `X${i}`, nom: `Test ${i}`, inscrite: i % 3 === 0 },
      };
    });
    await carte.getSource('pharmacies').setData({ type: 'FeatureCollection', features: entites });
    const images: number[] = [];
    let dernier = performance.now();
    let actif = true;
    const boucle = (t: number) => {
      images.push(t - dernier);
      dernier = t;
      if (actif) {
        requestAnimationFrame(boucle);
      }
    };
    requestAnimationFrame(boucle);
    for (const [zoom, lng, lat] of [[8, 10.1, 36.7], [11, 10.2, 36.8], [14, 10.15, 36.85], [9, 10.5, 35.5], [6.5, 9.8, 34.5]]) {
      await new Promise((fin) => {
        carte.once('moveend', fin);
        carte.easeTo({ zoom, center: [lng, lat], duration: 1500 });
      });
    }
    actif = false;
    const tri = images.slice(2).sort((a, b) => a - b);
    const moyenne = tri.reduce((s, v) => s + v, 0) / tri.length;
    return {
      images: tri.length,
      ips: Math.round(10000 / moyenne) / 10,
      p95: Math.round(tri[Math.floor(tri.length * 0.95)] * 10) / 10,
      max: Math.round(tri[tri.length - 1] * 10) / 10,
    };
  });
  console.log('FLUIDITE', JSON.stringify(mesure));
  expect(mesure.ips).toBeGreaterThan(30);
});

test('pas de saut de mise en page au chargement des polices', async ({ page }) => {
  await page.addInitScript(() => {
    (window as never as { saut: number }).saut = 0;
    new PerformanceObserver((liste) => {
      for (const entree of liste.getEntries() as never as { value: number; hadRecentInput: boolean }[]) {
        if (!entree.hadRecentInput) {
          (window as never as { saut: number }).saut += entree.value;
        }
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/compte/connexion');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(800);
  const saut = await page.evaluate(() => (window as never as { saut: number }).saut);
  console.log('SAUT', saut);
  expect(saut).toBeLessThan(0.1);
});
