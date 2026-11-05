import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  it("affiche l'en-tête, le pied de page et la navigation", async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();

    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('app-en-tete a.marque')?.textContent).toContain('Mawjoud');
    expect(element.querySelector('app-pied-de-page')?.textContent).toContain(
      'Moins de tours, plus de secours.',
    );
  });
});
