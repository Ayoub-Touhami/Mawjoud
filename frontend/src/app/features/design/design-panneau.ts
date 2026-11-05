import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Langue } from '../../core/i18n/traduction.config';
import { Theme } from '../../core/services/theme.service';
import { EnTete } from '../../layout/en-tete/en-tete';
import { PiedDePage } from '../../layout/pied-de-page/pied-de-page';
import { Bouton } from '../../shared/bouton/bouton';
import { CarteConteneur } from '../../shared/carte-conteneur/carte-conteneur';
import { Champ, Controle } from '../../shared/champ/champ';
import { Icone } from '../../shared/icone/icone';
import { ICONES, NomIcone } from '../../shared/icone/icones';
import { MarqueurPharmacie } from '../../shared/marqueur-pharmacie/marqueur-pharmacie';
import { MessageEtat } from '../../shared/message-etat/message-etat';
import { Motif } from '../../shared/motif/motif';
import { Pastille, PastilleStatut } from '../../shared/pastille-statut/pastille-statut';

@Component({
  selector: 'app-design-panneau',
  imports: [
    Bouton,
    CarteConteneur,
    Champ,
    Controle,
    EnTete,
    Icone,
    MarqueurPharmacie,
    MessageEtat,
    Motif,
    PastilleStatut,
    PiedDePage,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './design-panneau.html',
  styleUrl: './design-panneau.scss',
  host: {
    '[attr.lang]': 'langue()',
    '[attr.dir]': 'langue() === "ar" ? "rtl" : "ltr"',
    '[attr.data-theme]': 'theme()',
  },
})
export class DesignPanneau {
  readonly langue = input.required<Langue>();
  readonly theme = input.required<Theme>();

  protected readonly pastilles: Pastille[] = [
    'disponible',
    'quantite-limitee',
    'en-rupture',
    'a-confirmer',
    'non-inscrite',
    'inscrite-verifiee',
  ];
  protected readonly icones = Object.keys(ICONES) as NomIcone[];
}
