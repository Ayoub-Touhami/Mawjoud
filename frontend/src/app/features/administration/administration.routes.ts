import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { AnnuairePage } from './annuaire.page';
import { ReclamationsPage } from './reclamations.page';
import { SignalementsPage } from './signalements.page';

export const ADMINISTRATION_ROUTES: Routes = [
  {
    path: '',
    canActivate: [roleGuard('administrateur')],
    children: [
      { path: '', redirectTo: 'reclamations', pathMatch: 'full' },
      {
        path: 'reclamations',
        component: ReclamationsPage,
        title: 'Réclamations à valider · Mawjoud',
      },
      { path: 'annuaire', component: AnnuairePage, title: 'Annuaire des pharmacies · Mawjoud' },
      {
        path: 'signalements',
        component: SignalementsPage,
        title: "Signalements d'abus · Mawjoud",
      },
    ],
  },
];
