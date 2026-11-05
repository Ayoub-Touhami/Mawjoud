import { inject, InjectionToken } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Role } from '../models';
import { SessionService } from '../services/session.service';

export const GARDES_ACTIVES = new InjectionToken<boolean>('GARDES_ACTIVES', {
  providedIn: 'root',
  factory: () => environment.gardesActives,
});

/**
 * Réserve une route à certains rôles. Ce contrôle guide la navigation : la vraie protection
 * des données devra être faite par le back-end.
 */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return (_route, state) => {
    if (!inject(GARDES_ACTIVES)) {
      return true;
    }
    const session = inject(SessionService);
    const router = inject(Router);
    if (session.aLeRole(roles)) {
      return true;
    }
    return session.connecte()
      ? router.createUrlTree(['/'])
      : router.createUrlTree(['/compte/connexion'], { queryParams: { retour: state.url } });
  };
}
