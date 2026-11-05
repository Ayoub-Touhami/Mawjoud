import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { CreerAlertePage } from './creer-alerte.page';
import { MesAlertesPage } from './mes-alertes.page';

export const ALERTES_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: MesAlertesPage,
    canActivate: [roleGuard('patient')],
    title: 'Mes alertes · Mawjoud',
  },
  // Sans garde : le compte se crée sur cet écran même (F9).
  { path: 'creer', component: CreerAlertePage, title: 'Créer une alerte · Mawjoud' },
];
