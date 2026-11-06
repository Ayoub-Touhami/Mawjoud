import { TestBed } from '@angular/core/testing';
import { fournirTraductionTest } from '../../core/i18n/traduction.test-outils';
import { DonneesEmail, GabaritEmail } from './gabarit-email';

const DONNEES: DonneesEmail = {
  medicament: 'Levothyrox 50 µg',
  lieu: { fr: 'Tunis', ar: 'تونس' },
  pharmacie: 'Pharmacie du Marché',
  adresse: '12, rue des Oliviers, Tunis',
  age: { fr: 'il y a 2 h', ar: 'منذ 2 س' },
  lienCarte: '/carte',
  lienDesabonnement: '/desabonnement',
  lienSuppression: '/suppression',
};

describe("gabarit de l'e-mail d'alerte", () => {
  async function afficher(): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [fournirTraductionTest()] });
    const fixture = TestBed.createComponent(GabaritEmail);
    fixture.componentRef.setInput('donnees', DONNEES);
    await fixture.whenStable();
    return fixture.nativeElement;
  }

  it('contient tout ce que demande F11', async () => {
    const texte = (await afficher()).textContent;
    expect(texte).toContain('Levothyrox 50 µg est signalé disponible à Tunis');
    expect(texte).toContain('Pharmacie du Marché');
    expect(texte).toContain('12, rue des Oliviers, Tunis');
    expect(texte).toContain('Disponible');
    expect(texte).toContain('Déclaré par la pharmacie · il y a 2 h');
    expect(texte).toContain('Le stock peut changer vite');
    expect(texte).toContain('Cette alerte est maintenant terminée');
  });

  it('présente le français puis l arabe, avec le bon sens de lecture', async () => {
    const element = await afficher();
    const blocs = element.querySelectorAll('.corps');
    expect(blocs).toHaveLength(2);
    expect(blocs[0].getAttribute('dir')).toBe('ltr');
    expect(blocs[1].getAttribute('dir')).toBe('rtl');
    expect(blocs[1].textContent).toContain('عرض على الخريطة');
  });

  it('porte les liens de désabonnement et de suppression dans chaque langue (R12)', async () => {
    const element = await afficher();
    expect(element.querySelectorAll('a[href="/desabonnement"]')).toHaveLength(2);
    expect(element.querySelectorAll('a[href="/suppression"]')).toHaveLength(2);
    expect(element.querySelectorAll('a[href="/carte"]')).toHaveLength(2);
  });
});
