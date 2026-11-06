import { inject, Injectable } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { FormatService } from '../i18n/format.service';
import { LangueService } from '../i18n/langue.service';
import { estAConfirmer, StatutDeclare, StatutStock, Stock } from '../models';
import { HORLOGE } from './horloge';

export interface LectureStock {
  /** Statut à montrer : « a-confirmer » après 24 h sans mise à jour. */
  statut: StatutStock;
  /** Le statut déclaré n'est jamais supprimé : seule la mention s'ajoute (F7). */
  statutDeclare: StatutDeclare;
  aConfirmer: boolean;
  /** « il y a 2 h ». */
  age: string;
  /** Texte à côté du statut : l'âge, ou le dernier avis avec le statut déclaré. */
  detail: string;
}

/** Seul endroit qui décide de la fraîcheur d'un stock et de la façon de l'écrire (R5, R6). */
@Injectable({ providedIn: 'root' })
export class FraicheurService {
  private readonly horloge = inject(HORLOGE);
  private readonly format = inject(FormatService);
  private readonly transloco = inject(TranslocoService);
  private readonly langue = inject(LangueService).langue;

  lire(stock: Stock): LectureStock {
    this.langue();
    const maintenant = this.horloge();
    const aConfirmer = estAConfirmer(stock, maintenant);
    const age = this.format.age(stock.declareLe, maintenant.getTime());
    return {
      statut: aConfirmer ? 'a-confirmer' : stock.statutDeclare,
      statutDeclare: stock.statutDeclare,
      aConfirmer,
      age,
      detail: aConfirmer
        ? this.transloco.translate('fiche.dernierAvis', {
            age,
            statut: this.transloco.translate(`statut.${stock.statutDeclare}`).toLocaleLowerCase(),
          })
        : age,
    };
  }
}
