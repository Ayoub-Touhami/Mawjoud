import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { routes } from '../../app.routes';
import { fournirTraductionTest } from '../../core/i18n/traduction.test-outils';
import { Medicament } from '../../core/models';
import { PHARMACIE_API, PharmacieApi } from '../../core/services/pharmacie-api';
import { PharmacieApiMock } from '../../core/services/pharmacie-api.mock';

async function ouvrir(api: PharmacieApi, adresse: string) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter(routes),
      fournirTraductionTest(),
      { provide: PHARMACIE_API, useValue: api },
    ],
  });
  const harness = await RouterTestingHarness.create(adresse);
  await harness.fixture.whenStable();
  return harness;
}

describe('page de résultats', () => {
  it('annonce le chargement tant que la réponse manque', async () => {
    const api = new PharmacieApiMock();
    const attente = new Subject<Medicament | undefined>();
    vi.spyOn(api, 'obtenirMedicament').mockReturnValue(attente);
    const harness = await ouvrir(api, '/resultats?m=M015');
    expect(harness.routeNativeElement?.textContent).toContain('Recherche en cours');
  });

  it('propose de réessayer après une erreur réseau', async () => {
    const api = new PharmacieApiMock();
    const appel = vi
      .spyOn(api, 'stocksDeMedicament')
      .mockReturnValueOnce(throwError(() => new Error('réseau')))
      .mockReturnValue(of([]));
    const harness = await ouvrir(api, '/resultats?m=M015');
    const page = harness.routeNativeElement as HTMLElement;
    expect(page.textContent).toContain("La recherche n'a pas abouti");

    const bouton = [...page.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Réessayer'),
    );
    bouton?.click();
    await harness.fixture.whenStable();
    expect(appel).toHaveBeenCalledTimes(2);
    expect(page.textContent).not.toContain("La recherche n'a pas abouti");
  });

  it('demande un médicament quand la recherche est vide', async () => {
    const harness = await ouvrir(new PharmacieApiMock(), '/resultats');
    expect(harness.routeNativeElement?.textContent).toContain('Quel médicament cherchez-vous');
  });

  it('ouvre directement le seul médicament trouvé', async () => {
    const harness = await ouvrir(new PharmacieApiMock(), '/resultats?q=metformine');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Glucophage');
  });
});
