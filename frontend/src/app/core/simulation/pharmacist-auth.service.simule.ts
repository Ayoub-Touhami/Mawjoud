import { computed, inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Utilisateur } from '../models';
import { PharmacistAuthService } from '../services/pharmacist-auth.service';
import { AuthServiceSimule } from './auth.service.simule';

/** SIMULATION, posée sur les comptes simulés : un seul compte, donc un seul rôle par e-mail. */
@Injectable({ providedIn: 'root' })
export class PharmacistAuthServiceSimule implements PharmacistAuthService {
  private readonly auth = inject(AuthServiceSimule);

  readonly pharmacien = computed(() => {
    const compte = this.auth.utilisateur();
    return compte?.role === 'pharmacien' ? compte : null;
  });
  readonly peutDeclarer = computed(() => {
    const compte = this.pharmacien();
    return !!compte?.compteVerifie && !!compte.pharmacieId;
  });

  creerCompte(email: string, motDePasse: string): Observable<Utilisateur> {
    return this.auth.creerCompte(email, motDePasse, 'pharmacien');
  }
}
