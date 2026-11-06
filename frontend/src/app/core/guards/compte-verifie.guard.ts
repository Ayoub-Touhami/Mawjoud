import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AUTH_SERVICE } from '../services/auth.service';

/** Connexion exigée. Comme roleGuard, ce contrôle guide la navigation : le back-end protégera. */
export const compteConnecteGuard: CanActivateFn = (_route, state) =>
  inject(AUTH_SERVICE).utilisateur()
    ? true
    : inject(Router).createUrlTree(['/compte/connexion'], { queryParams: { retour: state.url } });

/** « Mes alertes » : compte connecté et adresse vérifiée, y compris en développement. */
export const compteVerifieGuard: CanActivateFn = (_route, state) => {
  const utilisateur = inject(AUTH_SERVICE).utilisateur();
  const router = inject(Router);
  if (!utilisateur) {
    return router.createUrlTree(['/compte/connexion'], { queryParams: { retour: state.url } });
  }
  if (utilisateur.role !== 'patient') {
    return router.createUrlTree(['/']);
  }
  return utilisateur.emailVerifie ? true : router.createUrlTree(['/compte/verification-email']);
};
