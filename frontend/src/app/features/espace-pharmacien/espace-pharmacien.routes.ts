import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards/role.guard';
import { EspacePharmacienPage } from './espace-pharmacien.page';
import { InscriptionPharmacienPage } from './inscription-pharmacien.page';
import { ReclamerPharmaciePage } from './reclamer-pharmacie.page';

export const ESPACE_PHARMACIEN_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: EspacePharmacienPage,
    canActivate: [roleGuard('pharmacien')],
    title: 'pages.espacePharmacien',
  },
  {
    path: 'inscription',
    component: InscriptionPharmacienPage,
    title: 'pages.inscriptionPharmacien',
  },
  {
    path: 'reclamer',
    component: ReclamerPharmaciePage,
    canActivate: [roleGuard('pharmacien')],
    title: 'pages.reclamerPharmacie',
  },
];
