import { Routes } from '@angular/router';
import { compteConnecteGuard } from '../../core/guards/compte-verifie.guard';
import { ConnexionPage } from './connexion.page';
import { DesabonnementPage } from './desabonnement.page';
import { MotDePasseOubliePage } from './mot-de-passe-oublie.page';
import { SuppressionComptePage } from './suppression-compte.page';
import { VerificationEmailPage } from './verification-email.page';

export const COMPTE_ROUTES: Routes = [
  { path: '', redirectTo: 'connexion', pathMatch: 'full' },
  { path: 'connexion', component: ConnexionPage, title: 'pages.connexion' },
  {
    path: 'verification-email',
    component: VerificationEmailPage,
    title: 'pages.verificationEmail',
  },
  {
    path: 'mot-de-passe-oublie',
    component: MotDePasseOubliePage,
    title: 'pages.motDePasseOublie',
  },
  // Sans garde : le lien de l'e-mail doit fonctionner sans connexion (F12).
  { path: 'desabonnement', component: DesabonnementPage, title: 'pages.desabonnement' },
  {
    path: 'suppression',
    component: SuppressionComptePage,
    canActivate: [compteConnecteGuard],
    title: 'pages.suppressionCompte',
  },
];
