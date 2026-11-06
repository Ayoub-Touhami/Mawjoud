import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { GARDES_ACTIVES } from './core/guards/role.guard';
import { fournirTraductionTest } from './core/i18n/traduction.test-outils';
import { PHARMACIE_API } from './core/services/pharmacie-api';
import { PharmacieApiMock } from './core/services/pharmacie-api.mock';

const PAGES: [string, string][] = [
  ['/', 'Carte des pharmacies'],
  ['/resultats', 'Résultats'],
  ['/pharmacie/T001', 'Pharmacie Test 01'],
  ['/compte/connexion', 'Connexion et inscription'],
  ['/compte/verification-email', "Vérification de l'e-mail"],
  ['/a-propos', 'À propos et contact'],
  ['/alertes/creer', 'Créer une alerte'],
  ['/alertes', 'Mes alertes'],
  ['/pharmacien/inscription', 'Inscription pharmacien'],
  ['/pharmacien', 'Espace pharmacien'],
  ['/pharmacien/reclamer', 'Réclamer ma pharmacie'],
  ['/admin/reclamations', 'Réclamations à valider'],
  ['/admin/annuaire', 'Annuaire des pharmacies'],
  ['/admin/signalements', "Signalements d'abus"],
];

describe('routes du plan du site', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        fournirTraductionTest(),
        { provide: GARDES_ACTIVES, useValue: false },
        { provide: PHARMACIE_API, useClass: PharmacieApiMock },
      ],
    });
  });

  it('couvre les 14 pages', () => {
    expect(PAGES.length).toBe(14);
  });

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
