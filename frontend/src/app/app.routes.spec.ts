import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from './app.routes';
import { GARDES_ACTIVES } from './core/guards/role.guard';
import { fournirTraductionTest } from './core/i18n/traduction.test-outils';
import { ALERT_SERVICE } from './core/services/alert.service';
import { AUTH_SERVICE } from './core/services/auth.service';
import { PHARMACIE_API } from './core/services/pharmacie-api';
import { PharmacieApiMock } from './core/services/pharmacie-api.mock';
import { AlertServiceSimule } from './core/simulation/alert.service.simule';
import { AuthServiceSimule } from './core/simulation/auth.service.simule';

const PAGES: [string, string][] = [
  ['/', 'Carte des pharmacies'],
  ['/resultats', 'Résultats'],
  ['/pharmacie/T001', 'Pharmacie Test 01'],
  ['/compte/connexion', 'Connexion et inscription'],
  ['/compte/verification-email', 'Vérifiez votre boîte mail'],
  ['/a-propos', 'À propos et contact'],
  ['/alertes/creer', "Être prévenu dès qu'il est disponible"],
  ['/pharmacien/inscription', 'Inscription pharmacien'],
  ['/pharmacien', 'Espace pharmacien'],
  ['/pharmacien/reclamer', 'Réclamer ma pharmacie'],
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
        { provide: PHARMACIE_API, useClass: PharmacieApiMock },
        { provide: AUTH_SERVICE, useExisting: AuthServiceSimule },
        { provide: ALERT_SERVICE, useExisting: AlertServiceSimule },
      ],
    });
  });

  it('couvre les 13 pages sans connexion', () => {
    expect(PAGES.length).toBe(13);
  });

  it('demande la connexion pour Mes alertes, même en développement', async () => {
    await RouterTestingHarness.create('/alertes');
    expect(TestBed.inject(Router).url).toBe('/compte/connexion?retour=%2Falertes');
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
