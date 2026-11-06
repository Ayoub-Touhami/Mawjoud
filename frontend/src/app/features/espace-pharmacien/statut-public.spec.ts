import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { fournirTraductionTest } from '../../core/i18n/traduction.test-outils';
import { CLAIM_SERVICE } from '../../core/services/claim.service';
import { HORLOGE } from '../../core/services/horloge';
import { STOCK_SERVICE } from '../../core/services/stock.service';
import { AuthServiceSimule } from '../../core/simulation/auth.service.simule';
import { fournirSimulation } from '../../core/simulation/fournir-simulation';

const PHARMACIE = 'T006';
const MEDICAMENT = 'M037';
const HEURE_MS = 60 * 60 * 1000;

/** Une déclaration du pharmacien doit se voir là où le public regarde. */
describe('statut déclaré, vu du public', () => {
  let maintenant: Date;

  beforeEach(async () => {
    localStorage.clear();
    maintenant = new Date('2026-11-06T10:00:00.000Z');
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        fournirTraductionTest(),
        fournirSimulation(),
        { provide: HORLOGE, useValue: () => maintenant },
      ],
    });
    const auth = TestBed.inject(AuthServiceSimule);
    const claims = TestBed.inject(CLAIM_SERVICE);
    await firstValueFrom(auth.creerCompte('ph@exemple.tn', 'mot-de-passe-test', 'pharmacien'));
    await firstValueFrom(auth.verifierEmail(auth.jetonEnAttente() as string));
    const demande = await firstValueFrom(claims.reclamer(PHARMACIE, {}));
    await firstValueFrom(claims.validerDemande(demande.id));
    await firstValueFrom(
      TestBed.inject(STOCK_SERVICE).declarer(PHARMACIE, MEDICAMENT, 'disponible'),
    );
  });

  async function textes(...adresses: string[]): Promise<string[]> {
    const harness = await RouterTestingHarness.create();
    const lus: string[] = [];
    for (const adresse of adresses) {
      await harness.navigateByUrl(adresse);
      await harness.fixture.whenStable();
      lus.push(harness.routeNativeElement?.textContent ?? '');
    }
    return lus;
  }

  it('montre le statut dans les résultats et sur la fiche', async () => {
    const [resultats, fiche] = await textes(`/resultats?m=${MEDICAMENT}`, `/pharmacie/${PHARMACIE}`);
    expect(resultats).toContain('Disponible');
    expect(fiche).toContain('Disponible');
  });

  it('ajoute « à confirmer » partout après 24 h, avec le statut déclaré', async () => {
    maintenant = new Date(maintenant.getTime() + 26 * HEURE_MS);
    const [resultats, fiche] = await textes(`/resultats?m=${MEDICAMENT}`, `/pharmacie/${PHARMACIE}`);
    expect(resultats).toContain('À confirmer');
    expect(resultats).toContain('dernier avis il y a 26 h, disponible');
    expect(fiche).toContain('À confirmer');
    expect(fiche).toContain('dernier avis il y a 26 h, disponible');
  });
});
