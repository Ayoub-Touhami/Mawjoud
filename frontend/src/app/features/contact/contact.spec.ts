import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ContactServiceSimule } from '../../core/simulation/contact.service.simule';
import { validerContact } from './contact.validation';

const MESSAGE = 'Le numéro de cette pharmacie a changé.';

describe('validation du contact', () => {
  it('accepte un message complet, nom facultatif', () => {
    expect(validerContact('nom@exemple.tn', 'question', MESSAGE)).toEqual({
      email: null,
      sujet: null,
      message: null,
    });
  });

  it('refuse un e-mail invalide', () => {
    expect(validerContact('nom@exemple', 'question', MESSAGE).email).toBe('compte.erreurs.email');
    expect(validerContact('', 'question', MESSAGE).email).toBe('compte.erreurs.email');
  });

  it('demande un sujet', () => {
    expect(validerContact('nom@exemple.tn', '', MESSAGE).sujet).toBe('contact.erreurs.sujet');
  });

  it('refuse un message vide, trop court ou trop long', () => {
    const erreur = (texte: string) => validerContact('nom@exemple.tn', 'autre', texte).message;
    expect(erreur('   ')).toBe('contact.erreurs.messageVide');
    expect(erreur('Trop bref')).toBe('contact.erreurs.messageCourt');
    expect(erreur('a'.repeat(2001))).toBe('contact.erreurs.messageLong');
  });
});

describe('envoi simulé du contact', () => {
  let service: ContactServiceSimule;
  const envoi = { email: 'nom@exemple.tn', sujet: 'question', message: MESSAGE } as const;

  beforeEach(() => {
    localStorage.clear();
    service = TestBed.inject(ContactServiceSimule);
  });

  it('enregistre le message', async () => {
    await firstValueFrom(service.envoyer(envoi));
    expect(localStorage.getItem('mawjoud.simulation')).toContain(MESSAGE);
  });

  it('signale un échec sans rien enregistrer, puis réussit au nouvel essai', async () => {
    service.simulerPanne(true);
    await expect(firstValueFrom(service.envoyer(envoi))).rejects.toBe('reseau');
    expect(localStorage.getItem('mawjoud.simulation') ?? '').not.toContain(MESSAGE);
    service.simulerPanne(false);
    await expect(firstValueFrom(service.envoyer(envoi))).resolves.toBeUndefined();
  });
});
