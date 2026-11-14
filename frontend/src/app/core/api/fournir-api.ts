import { Provider } from '@angular/core';
import { ALERT_SERVICE } from '../services/alert.service';
import { AUTH_SERVICE } from '../services/auth.service';
import { CLAIM_SERVICE } from '../services/claim.service';
import { CONTACT_SERVICE } from '../services/contact.service';
import { PHARMACIE_API } from '../services/pharmacie-api';
import { PHARMACIST_AUTH_SERVICE } from '../services/pharmacist-auth.service';
import { EVALUATEUR_ALERTES, STOCK_SERVICE } from '../services/stock.service';
import {
  AlertServiceHttp, AuthServiceHttp, ClaimServiceHttp, ContactServiceHttp, EvaluateurAlertesServeur,
  PharmacieApiHttp, PharmacistAuthServiceHttp, StockServiceHttp,
} from './services-api';

/** Services branchés sur l'API (Partie 9e) : mêmes jetons que fournirSimulation(), les écrans ne changent pas. */
export function fournirApi(): Provider[] {
  return [
    { provide: PHARMACIE_API, useExisting: PharmacieApiHttp },
    { provide: AUTH_SERVICE, useExisting: AuthServiceHttp },
    { provide: ALERT_SERVICE, useExisting: AlertServiceHttp },
    { provide: PHARMACIST_AUTH_SERVICE, useExisting: PharmacistAuthServiceHttp },
    { provide: CLAIM_SERVICE, useExisting: ClaimServiceHttp },
    { provide: STOCK_SERVICE, useExisting: StockServiceHttp },
    { provide: CONTACT_SERVICE, useExisting: ContactServiceHttp },
    { provide: EVALUATEUR_ALERTES, useExisting: EvaluateurAlertesServeur },
  ];
}
