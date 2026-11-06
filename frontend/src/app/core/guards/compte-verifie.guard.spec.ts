import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { Utilisateur } from '../models';
import { AUTH_SERVICE } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { compteVerifieGuard } from './compte-verifie.guard';

const PATIENT: Utilisateur = { id: 'u', email: 'p@x.tn', role: 'patient', emailVerifie: true };

describe('compteVerifieGuard', () => {
  function verifier(utilisateur: Utilisateur | null) {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AUTH_SERVICE,
          useFactory: () => ({ utilisateur: TestBed.inject(SessionService).utilisateur }),
        },
      ],
    });
    if (utilisateur) {
      TestBed.inject(SessionService).ouvrir(utilisateur);
    }
    const resultat = TestBed.runInInjectionContext(() =>
      compteVerifieGuard({} as never, { url: '/alertes' } as never),
    );
    return resultat === true
      ? true
      : TestBed.inject(Router).serializeUrl(resultat as UrlTree);
  }

  it('envoie un visiteur vers la connexion', () => {
    expect(verifier(null)).toBe('/compte/connexion?retour=%2Falertes');
  });

  it("envoie un compte non vérifié vers la vérification de l'e-mail", () => {
    expect(verifier({ ...PATIENT, emailVerifie: false })).toBe('/compte/verification-email');
  });

  it('laisse passer un compte vérifié', () => {
    expect(verifier(PATIENT)).toBe(true);
  });
});
