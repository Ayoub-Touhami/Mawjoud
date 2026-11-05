import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import ar from '../../i18n/ar.json';
import fr from '../../i18n/fr.json';
import { fournirTraductionTest } from '../core/i18n/traduction.test-outils';
import { Bouton } from './bouton/bouton';
import { Champ, Controle } from './champ/champ';
import { Icone } from './icone/icone';
import { MarqueurPharmacie } from './marqueur-pharmacie/marqueur-pharmacie';
import { MessageEtat } from './message-etat/message-etat';
import { Pastille, PastilleStatut } from './pastille-statut/pastille-statut';

function rendre<T>(composant: new () => T) {
  TestBed.configureTestingModule({ providers: [fournirTraductionTest()] });
  const fixture = TestBed.createComponent(composant);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

function cles(objet: object, prefixe = ''): string[] {
  return Object.entries(objet).flatMap(([cle, valeur]) =>
    typeof valeur === 'object' ? cles(valeur, `${prefixe}${cle}.`) : [`${prefixe}${cle}`],
  );
}

describe('fichiers de traduction', () => {
  it('fr et ar ont exactement les mêmes clés, sans texte vide', () => {
    expect(cles(ar).sort()).toEqual(cles(fr).sort());
    expect(JSON.stringify(ar)).not.toContain('""');
  });
});

describe('Icone', () => {
  @Component({ imports: [Icone], template: `<app-icone nom="coche" />` })
  class Hote {}

  it('affiche le SVG en ligne, en couleur du texte et masqué aux lecteurs d’écran', () => {
    const { element } = rendre(Hote);
    const icone = element.querySelector('app-icone');
    expect(icone?.querySelector('svg')?.getAttribute('stroke')).toBe('currentColor');
    expect(icone?.querySelector('svg')?.getAttribute('stroke-width')).toBe('1.75');
    expect(icone?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('PastilleStatut', () => {
  const statut = signal<Pastille>('disponible');
  @Component({
    imports: [PastilleStatut],
    template: `<app-pastille-statut [statut]="statut()" />`,
  })
  class Hote {
    statut = statut;
  }

  it.each<[Pastille, string]>([
    ['disponible', 'Disponible'],
    ['quantite-limitee', 'Quantité limitée'],
    ['en-rupture', 'En rupture'],
    ['a-confirmer', 'À confirmer'],
    ['non-inscrite', 'Non inscrite'],
  ])('%s montre le mot « %s » et un signe', (valeur, mot) => {
    statut.set(valeur);
    const { element } = rendre(Hote);
    expect(element.textContent).toContain(mot);
    expect(element.querySelector('svg')).not.toBeNull();
  });
});

describe('Bouton', () => {
  const clics = signal(0);
  @Component({
    imports: [Bouton],
    template: `<button appBouton [chargement]="true" (click)="clics.set(1)">Envoyer</button>`,
  })
  class Hote {
    clics = clics;
  }

  it('bloque le clic pendant le chargement sans perdre le focus', () => {
    clics.set(0);
    const { element } = rendre(Hote);
    const bouton = element.querySelector('button') as HTMLButtonElement;
    bouton.click();
    expect(clics()).toBe(0);
    expect(bouton.disabled).toBe(false);
    expect(bouton.getAttribute('aria-busy')).toBe('true');
  });
});

describe('Champ', () => {
  @Component({
    imports: [Champ, Controle],
    template: `
      <app-champ libelle="E-mail" aide="Un lien vérifie votre e-mail." erreur="Adresse invalide.">
        <input appControle />
      </app-champ>
    `,
  })
  class Hote {}

  it('relie le libellé, l’aide et l’erreur au contrôle', () => {
    const { element } = rendre(Hote);
    const controle = element.querySelector('input') as HTMLInputElement;
    expect(element.querySelector('label')?.getAttribute('for')).toBe(controle.id);
    expect(controle.getAttribute('aria-invalid')).toBe('true');
    const decrit = controle.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(decrit).toHaveLength(2);
    for (const id of decrit) {
      expect(element.querySelector(`[id="${id}"]`)).not.toBeNull();
    }
  });
});

describe('MarqueurPharmacie', () => {
  @Component({
    imports: [MarqueurPharmacie],
    template: `
      <app-marqueur-pharmacie [inscrite]="true" />
      <app-marqueur-pharmacie [inscrite]="false" />
    `,
  })
  class Hote {}

  it('distingue les marqueurs par le signe et par le nom accessible', () => {
    const { element } = rendre(Hote);
    const [inscrite, nonInscrite] = Array.from(element.querySelectorAll('svg'));
    expect(inscrite.querySelector('.coche')).not.toBeNull();
    expect(inscrite.getAttribute('aria-label')).toBe('Inscrite, stock déclaré');
    expect(nonInscrite.querySelector('.interrogation')).not.toBeNull();
    expect(nonInscrite.querySelector('.vide')).not.toBeNull();
    expect(nonInscrite.getAttribute('aria-label')).toBe('Non inscrite, appelez');
  });
});

describe('MessageEtat', () => {
  @Component({
    imports: [MessageEtat],
    template: `
      <app-message-etat type="erreur" titre="Erreur" />
      <app-message-etat type="chargement" titre="Chargement" />
    `,
  })
  class Hote {}

  it('annonce les erreurs et les états aux lecteurs d’écran', () => {
    const { element } = rendre(Hote);
    const [erreur, chargement] = Array.from(element.querySelectorAll('app-message-etat'));
    expect(erreur.getAttribute('role')).toBe('alert');
    expect(chargement.getAttribute('role')).toBe('status');
    expect(chargement.getAttribute('aria-busy')).toBe('true');
  });
});
