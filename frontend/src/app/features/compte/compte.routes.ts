import { Routes } from '@angular/router';
import { ConnexionPage } from './connexion.page';
import { VerificationEmailPage } from './verification-email.page';

export const COMPTE_ROUTES: Routes = [
  { path: '', redirectTo: 'connexion', pathMatch: 'full' },
  { path: 'connexion', component: ConnexionPage, title: 'Connexion · Mawjoud' },
  {
    path: 'verification-email',
    component: VerificationEmailPage,
    title: "Vérification de l'e-mail · Mawjoud",
  },
];
