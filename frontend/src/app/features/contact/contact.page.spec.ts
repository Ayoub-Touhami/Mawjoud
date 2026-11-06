import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { fournirTraductionTest } from '../../core/i18n/traduction.test-outils';
import { CONTACT_SERVICE, MessageContact } from '../../core/services/contact.service';
import { fournirSimulation } from '../../core/simulation/fournir-simulation';
import { ContactPage } from './contact.page';

describe('ContactPage pendant l envoi', () => {
  it('bloque le bouton et n envoie qu une fois', async () => {
    const reponse = new Subject<void>();
    const envois: MessageContact[] = [];
    TestBed.configureTestingModule({
      imports: [ContactPage],
      providers: [
        provideRouter([]),
        fournirTraductionTest(),
        fournirSimulation(),
        {
          provide: CONTACT_SERVICE,
          useValue: {
            envoyer: (message: MessageContact) => {
              envois.push(message);
              return reponse;
            },
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ContactPage);
    await fixture.whenStable();
    const racine = fixture.nativeElement as HTMLElement;
    const saisir = (selecteur: string, valeur: string, evenement: string) => {
      const champ = racine.querySelector(selecteur) as HTMLInputElement;
      champ.value = valeur;
      champ.dispatchEvent(new Event(evenement));
    };
    saisir('input[type=email]', 'nom@exemple.tn', 'input');
    saisir('select', 'question', 'change');
    saisir('textarea', 'Une question assez longue.', 'input');

    const bouton = racine.querySelector('button[type=submit]') as HTMLButtonElement;
    bouton.click();
    await fixture.whenStable();
    expect(bouton.getAttribute('aria-disabled')).toBe('true');
    bouton.click();
    expect(envois).toHaveLength(1);

    reponse.next();
    reponse.complete();
    await new Promise((fin) => setTimeout(fin));
    await fixture.whenStable();
    expect(racine.textContent).toContain('Votre message est enregistré');
  });
});
