import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { Utilisateur } from '../models';
import { SessionService } from '../services/session.service';
import { GARDES_ACTIVES, roleGuard } from './role.guard';

const PATIENT: Utilisateur = { id: 'u', email: 'p@x.example', role: 'patient', emailVerifie: true };
const etat = { url: '/admin/annuaire' } as never;
const route = {} as never;

describe('roleGuard', () => {
  function lancer(actives: boolean) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: GARDES_ACTIVES, useValue: actives }],
    });
    return TestBed.inject(SessionService);
  }
  const verifier = () =>
    TestBed.runInInjectionContext(() => roleGuard('administrateur')(route, etat));
  const adresse = (resultat: unknown) => TestBed.inject(Router).serializeUrl(resultat as UrlTree);

  it('laisse passer quand les gardes sont désactivées', () => {
    lancer(false);
    expect(verifier()).toBe(true);
  });

  it('envoie un visiteur vers la connexion en gardant la destination', () => {
    lancer(true);
    expect(adresse(verifier())).toBe('/compte/connexion?retour=%2Fadmin%2Fannuaire');
  });

  it("renvoie à l'accueil un compte sans le bon rôle", () => {
    lancer(true).ouvrir(PATIENT);
    expect(adresse(verifier())).toBe('/');
  });

  it('laisse passer le bon rôle', () => {
    lancer(true).ouvrir({ ...PATIENT, role: 'administrateur' });
    expect(verifier()).toBe(true);
  });
});
