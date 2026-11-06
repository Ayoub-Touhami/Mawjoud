import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AUTH_SERVICE } from '../services/auth.service';

/**
 * Contrôlée avant le chargement : le code d'administration n'arrive jamais chez les autres
 * comptes. Active aussi en développement. Le back-end refusera aussi ces actions.
 */
export const adminGuard: CanMatchFn = (_route, segments) => {
  const compte = inject(AUTH_SERVICE).utilisateur();
  const router = inject(Router);
  if (!compte) {
    const retour = `/${segments.map((s) => s.path).join('/')}`;
    return router.createUrlTree(['/compte/connexion'], { queryParams: { retour } });
  }
  return compte.role === 'administrateur' ? true : router.createUrlTree(['/acces-refuse']);
};
