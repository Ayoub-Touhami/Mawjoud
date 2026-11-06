import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
import { DemandeReclamation, Utilisateur } from '../models';
import { AUTH_SERVICE } from '../services/auth.service';
import { CLAIM_SERVICE } from '../services/claim.service';

export type EtapePharmacien = '/pharmacien' | '/pharmacien/reclamer' | '/pharmacien/attente';

/** Où en est le pharmacien : compte, e-mail, réclamation, puis espace de déclaration. */
export function etapePharmacien(
  compte: Utilisateur,
  demande: DemandeReclamation | null,
): EtapePharmacien | '/compte/verification-email' {
  if (!compte.emailVerifie) {
    return '/compte/verification-email';
  }
  if (compte.compteVerifie && compte.pharmacieId) {
    return '/pharmacien';
  }
  return demande?.etat === 'en-attente' ? '/pharmacien/attente' : '/pharmacien/reclamer';
}

/**
 * Laisse passer seulement à la bonne étape, aussi en développement : un compte non vérifié
 * n'atteint jamais l'écran de déclaration (R3). Le back-end refusera aussi la déclaration.
 */
export function pharmacienGuard(etape: EtapePharmacien): CanActivateFn {
  return (_route, state) => {
    const compte = inject(AUTH_SERVICE).utilisateur();
    const router = inject(Router);
    if (!compte) {
      return router.createUrlTree(['/compte/connexion'], { queryParams: { retour: state.url } });
    }
    if (compte.role !== 'pharmacien') {
      return router.createUrlTree(['/']);
    }
    return inject(CLAIM_SERVICE)
      .maDemande()
      .pipe(
        map((demande) => {
          const attendue = etapePharmacien(compte, demande);
          return attendue === etape ? true : router.parseUrl(attendue);
        }),
      );
  };
}
