import { Routes } from '@angular/router';
import { compteVerifieGuard } from '../../core/guards/compte-verifie.guard';
import { CreerAlertePage } from './creer-alerte.page';
import { MesAlertesPage } from './mes-alertes.page';

export const ALERTES_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: MesAlertesPage,
    canActivate: [compteVerifieGuard],
    title: 'pages.mesAlertes',
  },
  // Sans garde : le compte se crée sur cet écran même (F9).
  { path: 'creer', component: CreerAlertePage, title: 'pages.creerAlerte' },
];
