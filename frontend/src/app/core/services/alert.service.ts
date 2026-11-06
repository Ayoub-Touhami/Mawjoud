import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { Alerte } from '../models';

export type ErreurAlerte = 'non-connecte' | 'doublon' | 'introuvable' | 'lien-invalide';

export interface CreationAlerte {
  alerte: Alerte;
  /** Vrai si cette alerte existait déjà : rien n'a été créé (F10). */
  existante: boolean;
}

/** Contrat entre les écrans et les alertes, pour le compte connecté. */
export interface AlertService {
  listerAlertes(): Observable<Alerte[]>;
  /** `ville` vaut null pour « toutes les villes ». */
  creerAlerte(medicamentId: string, ville: string | null): Observable<CreationAlerte>;
  /** Refuse la modification qui créerait un doublon (erreur « doublon »). */
  modifierAlerte(id: string, ville: string | null): Observable<Alerte>;
  supprimerAlerte(id: string): Observable<void>;

  /** Sans connexion : le lien de l'e-mail arrête toutes les alertes de cette adresse. */
  desabonner(jeton: string): Observable<void>;
}

export const ALERT_SERVICE = new InjectionToken<AlertService>('ALERT_SERVICE');
