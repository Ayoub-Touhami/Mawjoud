import { Provider } from '@angular/core';
import { ALERT_SERVICE } from '../services/alert.service';
import { AUTH_SERVICE } from '../services/auth.service';
import { CLAIM_SERVICE } from '../services/claim.service';
import { CONTACT_SERVICE } from '../services/contact.service';
import { PHARMACIE_API } from '../services/pharmacie-api';
import { PharmacieApiMock } from '../services/pharmacie-api.mock';
import { PHARMACIST_AUTH_SERVICE } from '../services/pharmacist-auth.service';
import { EVALUATEUR_ALERTES, STOCK_SERVICE } from '../services/stock.service';
import { AlertServiceSimule } from './alert.service.simule';
import { AuthServiceSimule } from './auth.service.simule';
import { ClaimServiceSimule } from './claim.service.simule';
import { ContactServiceSimule } from './contact.service.simule';
import { EvaluateurAlertesSimule } from './evaluateur-alertes.simule';
import { PharmacistAuthServiceSimule } from './pharmacist-auth.service.simule';
import { StockServiceSimule } from './stock.service.simule';

/** Pour brancher le back-end, seule cette liste changera : les écrans ne voient que les jetons. */
export function fournirSimulation(): Provider[] {
  return [
    { provide: PHARMACIE_API, useClass: PharmacieApiMock },
    { provide: AUTH_SERVICE, useExisting: AuthServiceSimule },
    { provide: ALERT_SERVICE, useExisting: AlertServiceSimule },
    { provide: PHARMACIST_AUTH_SERVICE, useExisting: PharmacistAuthServiceSimule },
    { provide: CLAIM_SERVICE, useExisting: ClaimServiceSimule },
    { provide: STOCK_SERVICE, useExisting: StockServiceSimule },
    { provide: CONTACT_SERVICE, useExisting: ContactServiceSimule },
    { provide: EVALUATEUR_ALERTES, useExisting: EvaluateurAlertesSimule },
  ];
}
