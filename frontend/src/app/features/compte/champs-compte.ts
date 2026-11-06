import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Champ, Controle } from '../../shared/champ/champ';

const LONGUEUR_MOT_DE_PASSE = 8;

export interface ErreursChamps {
  email: string | null;
  motDePasse: string | null;
}

/** Renvoie les clés de traduction des erreurs. Sert aussi à refuser l'envoi du formulaire. */
export function verifierChamps(email: string, motDePasse: string, nouveau: boolean): ErreursChamps {
  return {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'compte.erreurs.email',
    motDePasse: !motDePasse
      ? 'compte.erreurs.motDePasseVide'
      : nouveau && motDePasse.length < LONGUEUR_MOT_DE_PASSE
        ? 'compte.erreurs.motDePasseCourt'
        : null,
  };
}

/** E-mail et mot de passe : seules données demandées pour un compte (R13). */
@Component({
  selector: 'app-champs-compte',
  imports: [Champ, Controle, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-champ
      icone="email"
      [libelle]="libelleEmail() | transloco"
      [erreur]="erreurs().email ? (erreurs().email! | transloco) : ''"
    >
      <input
        appControle
        type="email"
        autocomplete="email"
        inputmode="email"
        dir="ltr"
        placeholder="nom@exemple.tn"
        [value]="email()"
        (input)="email.set($any($event.target).value)"
      />
    </app-champ>
    <app-champ
      icone="cadenas"
      [libelle]="'compte.motDePasse' | transloco"
      [aide]="nouveau() ? ('compte.aideMotDePasse' | transloco) : ''"
      [erreur]="erreurs().motDePasse ? (erreurs().motDePasse! | transloco) : ''"
    >
      <input
        appControle
        type="password"
        dir="ltr"
        [attr.autocomplete]="nouveau() ? 'new-password' : 'current-password'"
        [value]="motDePasse()"
        (input)="motDePasse.set($any($event.target).value)"
      />
    </app-champ>
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--e-4);
    }
  `,
})
export class ChampsCompte {
  readonly email = model('');
  readonly motDePasse = model('');
  readonly nouveau = input(false);
  readonly libelleEmail = input('compte.email');
  readonly erreurs = input<ErreursChamps>({ email: null, motDePasse: null });
}
