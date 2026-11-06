import { Routes } from '@angular/router';
import { pharmacienGuard } from '../../core/guards/pharmacien.guard';
import { AttenteVerificationPage } from './attente-verification.page';
import { EspacePharmacienPage } from './espace-pharmacien.page';
import { InscriptionPharmacienPage } from './inscription-pharmacien.page';
import { ReclamerPharmaciePage } from './reclamer-pharmacie.page';

export const ESPACE_PHARMACIEN_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    component: EspacePharmacienPage,
    canActivate: [pharmacienGuard('/pharmacien')],
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
    canActivate: [pharmacienGuard('/pharmacien/reclamer')],
    title: 'pages.reclamerPharmacie',
  },
  {
    path: 'attente',
    component: AttenteVerificationPage,
    canActivate: [pharmacienGuard('/pharmacien/attente')],
    title: 'pages.attenteVerification',
  },
];
