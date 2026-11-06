import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject, throwError } from 'rxjs';
import { routes } from '../../app.routes';
import { fournirTraductionTest } from '../../core/i18n/traduction.test-outils';
import { Medicament } from '../../core/models';
import { PHARMACIE_API } from '../../core/services/pharmacie-api';
import { STOCK_SERVICE } from '../../core/services/stock.service';
import { fournirSimulation } from '../../core/simulation/fournir-simulation';

function preparer() {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [provideRouter(routes), fournirTraductionTest(), fournirSimulation()],
  });
}

async function ouvrir(adresse: string) {
  const harness = await RouterTestingHarness.create(adresse);
  await harness.fixture.whenStable();
  return harness;
}

describe('page de résultats', () => {
  beforeEach(preparer);

  it('annonce le chargement tant que la réponse manque', async () => {
    const api = TestBed.inject(PHARMACIE_API);
    const attente = new Subject<Medicament | undefined>();
    vi.spyOn(api, 'obtenirMedicament').mockReturnValue(attente);
    const harness = await ouvrir('/resultats?m=M015');
    expect(harness.routeNativeElement?.textContent).toContain('Recherche en cours');
  });

  it('propose de réessayer après une erreur réseau', async () => {
    const appel = vi
      .spyOn(TestBed.inject(STOCK_SERVICE), 'stocksDeMedicament')
      .mockReturnValueOnce(throwError(() => new Error('réseau')))
      .mockReturnValue(of([]));
    const harness = await ouvrir('/resultats?m=M015');
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
    const harness = await ouvrir('/resultats');
    expect(harness.routeNativeElement?.textContent).toContain('Quel médicament cherchez-vous');
  });

  it('ouvre directement le seul médicament trouvé', async () => {
    const harness = await ouvrir('/resultats?q=metformine');
    expect(harness.routeNativeElement?.querySelector('h1')?.textContent).toContain('Glucophage');
  });
});
