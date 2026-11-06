import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { GARDES_ACTIVES } from './core/guards/role.guard';
import { fournirTraductionTest } from './core/i18n/traduction.test-outils';
import { fournirSimulation } from './core/simulation/fournir-simulation';

const PAGES: [string, string][] = [
  ['/', 'Carte des pharmacies'],
  ['/resultats', 'Résultats'],
  ['/pharmacie/T001', 'Pharmacie Test 01'],
  ['/compte/connexion', 'Connexion et inscription'],
  ['/compte/verification-email', 'Vérifiez votre boîte mail'],
  ['/a-propos', 'À propos et contact'],
  ['/alertes/creer', "Être prévenu dès qu'il est disponible"],
  ['/pharmacien/inscription', 'Créez votre compte'],
  ['/admin/reclamations', 'Réclamations à valider'],
  ['/admin/annuaire', 'Annuaire des pharmacies'],
  ['/admin/signalements', "Signalements d'abus"],
];

describe('routes du plan du site', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        fournirTraductionTest(),
        { provide: GARDES_ACTIVES, useValue: false },
        fournirSimulation(),
      ],
    });
  });

  it('couvre les 11 pages sans connexion', () => {
    expect(PAGES.length).toBe(11);
  });

  it.each(['/alertes', '/pharmacien', '/pharmacien/reclamer', '/pharmacien/attente'])(
    'demande la connexion pour %s, même en développement',
    async (adresse) => {
      await RouterTestingHarness.create(adresse);
      expect(TestBed.inject(Router).url).toContain('/compte/connexion?retour=');
    },
  );

  it.each(PAGES)('%s affiche « %s »', async (adresse, titre) => {
    const harness = await RouterTestingHarness.create(adresse);
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe(titre);
  });

  it('affiche la page introuvable pour une adresse inconnue', async () => {
    const harness = await RouterTestingHarness.create('/adresse-inconnue');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toBe('Page introuvable');
    expect(TestBed.inject(Router).url).toBe('/adresse-inconnue');
  });
});
