import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Icone } from '../icone/icone';
import { NomIcone } from '../icone/icones';
import { Motif } from '../motif/motif';

export type TypeEtat = 'erreur' | 'vide' | 'hors-connexion' | 'chargement';

const SIGNES: Record<Exclude<TypeEtat, 'chargement'>, NomIcone> = {
  erreur: 'fermer',
  vide: 'loupe',
  'hors-connexion': 'hors-connexion',
};

/** Message d'état, avec les actions passées en contenu. Le motif reste séparé du texte. */
@Component({
  selector: 'app-message-etat',
  imports: [Icone, Motif],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './message-etat.html',
  styleUrl: './message-etat.scss',
  host: {
    '[attr.role]': 'type() === "erreur" ? "alert" : "status"',
    '[attr.aria-busy]': 'type() === "chargement" ? "true" : null',
  },
})
export class MessageEtat {
  readonly type = input.required<TypeEtat>();
  readonly titre = input.required<string>();
  readonly texte = input('');

  protected readonly signe = computed(() => {
    const type = this.type();
    return type === 'chargement' ? null : SIGNES[type];
  });
}
