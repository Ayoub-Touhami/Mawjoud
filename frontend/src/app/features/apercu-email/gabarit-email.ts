import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { provideTranslocoLang, TranslocoPipe } from '@jsverse/transloco';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { Logo } from '../../shared/logo/logo';
import { Motif } from '../../shared/motif/motif';
import { PastilleStatut } from '../../shared/pastille-statut/pastille-statut';

/** Contenu d'un e-mail d'alerte. Toutes les valeurs viendront du back-end. */
export interface DonneesEmail {
  medicament: string;
  /** Nom de la ville, par langue : le gabarit écrit les deux. */
  lieu: { fr: string; ar: string };
  pharmacie: string;
  adresse: string;
  /** Durée déjà rédigée, par langue. */
  age: { fr: string; ar: string };
  lienCarte: string;
  lienDesabonnement: string;
  lienSuppression: string;
}

/** Une langue de l'e-mail. */
@Component({
  selector: 'app-bloc-email',
  imports: [Bouton, Icone, PastilleStatut, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-pastille-statut statut="disponible" />
    <h2>{{ 'email.objet' | transloco: { nom: donnees().medicament, lieu: lieu() } }}</h2>

    <div class="pharmacie">
      <strong class="medicament" dir="ltr">{{ donnees().medicament }}</strong>
      <strong class="nom" dir="auto">{{ donnees().pharmacie }}</strong>
      <p>
        <app-icone nom="marqueur" [taille]="22" />
        <span dir="auto">{{ donnees().adresse }}</span>
      </p>
      <p>
        <app-icone nom="horloge" [taille]="22" />
        <span class="fort">{{ 'email.declare' | transloco: { age: age() } }}</span>
      </p>
    </div>

    <a appBouton class="voir" [href]="donnees().lienCarte">{{ 'email.voir' | transloco }}</a>

    <p>{{ 'email.avertissement' | transloco }}</p>
    <p class="fin">{{ 'email.termine' | transloco }}</p>
    <hr />
    <p class="petit">
      {{ 'email.raison' | transloco: { nom: donnees().medicament, lieu: lieu() } }}
    </p>
    <p class="liens">
      <a [href]="donnees().lienDesabonnement">{{ 'email.desabonner' | transloco }}</a>
      <a [href]="donnees().lienSuppression">{{ 'email.supprimer' | transloco }}</a>
    </p>
    <p class="petit">{{ 'email.donnees' | transloco }}</p>
  `,
  styleUrl: './bloc-email.scss',
})
export class BlocEmail {
  readonly donnees = input.required<DonneesEmail>();
  readonly lieu = input.required<string>();
  readonly age = input.required<string>();
}

@Component({
  selector: 'app-bloc-email-francais',
  imports: [BlocEmail],
  providers: [provideTranslocoLang('fr')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-bloc-email [donnees]="donnees()" [lieu]="donnees().lieu.fr" [age]="donnees().age.fr" />`,
})
export class BlocEmailFrancais {
  readonly donnees = input.required<DonneesEmail>();
}

@Component({
  selector: 'app-bloc-email-arabe',
  imports: [BlocEmail],
  providers: [provideTranslocoLang('ar')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-bloc-email [donnees]="donnees()" [lieu]="donnees().lieu.ar" [age]="donnees().age.ar" />`,
})
export class BlocEmailArabe {
  readonly donnees = input.required<DonneesEmail>();
}

/**
 * Gabarit visuel de l'e-mail : français puis arabe dans un seul message, pour ne pas enregistrer
 * la langue du patient. Thème clair fixe. Le back-end devra le transposer pour les messageries.
 */
@Component({
  selector: 'app-gabarit-email',
  imports: [BlocEmailArabe, BlocEmailFrancais, Logo, Motif, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="enveloppe" data-theme="clair">
      <p class="de">{{ 'email.de' | transloco }}</p>
      <p class="objet" dir="auto">
        {{
          'email.objet'
            | transloco: { nom: donnees().medicament, lieu: donnees().lieu.fr }
        }}
      </p>
      <article>
        <app-motif ton="sombre" class="entete">
          <span class="logo" data-theme="sombre"><app-logo [taille]="48" /></span>
        </app-motif>
        <div class="corps" lang="fr" dir="ltr"><app-bloc-email-francais [donnees]="donnees()" /></div>
        <div class="corps arabe" lang="ar" dir="rtl">
          <app-bloc-email-arabe [donnees]="donnees()" />
        </div>
      </article>
    </div>
  `,
  styles: `
    .enveloppe {
      padding: var(--e-4) var(--e-3);
      color: #10231b;
      background: #e6e0d0;
      border-radius: var(--rayon);
    }

    .de,
    .objet {
      margin-block: 0 var(--e-1);
    }

    .de {
      font-size: 14px;
      color: #4a5b53;
    }

    .objet {
      margin-block-end: var(--e-3);
      font-weight: 600;
    }

    article {
      max-inline-size: 600px;
      margin-inline: auto;
      overflow: hidden;
      background: #fffcf6;
      border-radius: var(--rayon-grand);
    }

    .entete {
      display: grid;
      place-items: center;
      min-block-size: 112px;
      background: #0b3d2e;
      border-radius: 0;
    }

    .logo {
      position: relative;
      display: inline-block;
      padding: var(--e-1) var(--e-3);
      background: #0b3d2e;
      border-radius: var(--rayon);
    }

    .corps {
      padding: var(--e-5) var(--e-4);
    }

    .arabe {
      border-block-start: 2px solid #ded8c9;
    }
  `,
})
export class GabaritEmail {
  readonly donnees = input.required<DonneesEmail>();
}
