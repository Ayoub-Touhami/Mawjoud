import { Routes } from '@angular/router';
import { AdminLayout } from './admin-layout';
import { AnnuairePage } from './annuaire.page';
import { DossierDemandePage } from './dossier-demande.page';
import { FicheAnnuairePage } from './fiche-annuaire.page';
import { JournalPage } from './journal.page';
import { ReclamationsPage } from './reclamations.page';
import { fournirAdministration } from './services/admin.simule';
import { SignalementsPage } from './signalements.page';
import { TableauDeBordPage } from './tableau-de-bord.page';

/** La garde adminGuard est posée sur la route parente, avant tout chargement. */
export const ADMINISTRATION_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayout,
    providers: fournirAdministration(),
    children: [
      { path: '', pathMatch: 'full', component: TableauDeBordPage, title: 'pages.administration' },
      { path: 'reclamations', component: ReclamationsPage, title: 'pages.reclamations' },
      { path: 'reclamations/:id', component: DossierDemandePage, title: 'pages.reclamations' },
      { path: 'annuaire', component: AnnuairePage, title: 'pages.annuaire' },
      { path: 'annuaire/:id', component: FicheAnnuairePage, title: 'pages.annuaire' },
      { path: 'signalements', component: SignalementsPage, title: 'pages.signalements' },
      { path: 'journal', component: JournalPage, title: 'pages.journal' },
    ],
  },
];
