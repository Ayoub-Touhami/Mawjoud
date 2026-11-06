import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { StatutStock } from '../../core/models';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { NomIcone } from '../../shared/icone/icones';
import { PastilleStatut } from '../../shared/pastille-statut/pastille-statut';
import { LegendeCarte } from '../carte/legende-carte';
import { environment } from '../../../environments/environment';

const ETAPES: { cle: string; icone: NomIcone }[] = [
  { cle: 'chercher', icone: 'loupe' },
  { cle: 'voir', icone: 'marqueur' },
  { cle: 'appeler', icone: 'telephone' },
];
const STATUTS: StatutStock[] = ['disponible', 'quantite-limitee', 'en-rupture', 'a-confirmer'];

@Component({
  selector: 'app-a-propos-page',
  imports: [Bouton, Icone, LegendeCarte, PastilleStatut, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './a-propos.page.html',
  styleUrl: './a-propos.page.scss',
})
export class AProposPage {
  protected readonly etapes = ETAPES;
  protected readonly statuts = STATUTS;
  protected readonly donneesTest = environment.donneesSimulees;
}
