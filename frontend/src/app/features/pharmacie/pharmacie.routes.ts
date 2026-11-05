import { Routes } from '@angular/router';
import { FichePharmaciePage } from './fiche-pharmacie.page';

export const PHARMACIE_ROUTES: Routes = [
  { path: ':id', component: FichePharmaciePage, title: 'pages.fichePharmacie' },
];
