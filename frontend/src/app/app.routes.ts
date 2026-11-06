import { Routes } from '@angular/router';
import { environment } from '../environments/environment';

/** Les 14 pages du plan du site, avec un fichier chargé à la demande par fonctionnalité. */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadChildren: () => import('./features/carte/carte.routes').then((m) => m.CARTE_ROUTES),
  },
  {
    path: 'resultats',
    loadChildren: () =>
      import('./features/recherche/recherche.routes').then((m) => m.RECHERCHE_ROUTES),
  },
  {
    path: 'pharmacie',
    loadChildren: () =>
      import('./features/pharmacie/pharmacie.routes').then((m) => m.PHARMACIE_ROUTES),
  },
  {
    path: 'compte',
    loadChildren: () => import('./features/compte/compte.routes').then((m) => m.COMPTE_ROUTES),
  },
  {
    path: 'alertes',
    loadChildren: () => import('./features/alertes/alertes.routes').then((m) => m.ALERTES_ROUTES),
  },
  {
    path: 'pharmacien',
    loadChildren: () =>
      import('./features/espace-pharmacien/espace-pharmacien.routes').then(
        (m) => m.ESPACE_PHARMACIEN_ROUTES,
      ),
  },
  {
    path: 'admin',
    loadChildren: () =>
      import('./features/administration/administration.routes').then(
        (m) => m.ADMINISTRATION_ROUTES,
      ),
  },
  {
    path: 'a-propos',
    loadChildren: () =>
      import('./features/a-propos/a-propos.routes').then((m) => m.A_PROPOS_ROUTES),
  },
  ...environment.routesDeveloppement,
  {
    path: '**',
    title: 'pages.introuvable',
    loadComponent: () =>
      import('./features/introuvable/introuvable.page').then((m) => m.IntrouvablePage),
  },
];
