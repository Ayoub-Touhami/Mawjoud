import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';
import { fournirTraductionTest } from './core/i18n/traduction.test-outils';
import { fournirSimulation } from './core/simulation/fournir-simulation';

describe('App', () => {
  it("affiche l'en-tête, le pied de page et la navigation", async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        fournirTraductionTest(),
        fournirSimulation(),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('app-en-tete app-logo')?.textContent).toContain('Mawjoud');
    expect(element.querySelector('app-pied-de-page')?.textContent).toContain(
      'Moins de tours, plus de secours.',
    );
  });
});
