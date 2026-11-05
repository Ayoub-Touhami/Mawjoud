import { inject, Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

/** Les titres de route sont des clés de traduction : l'onglet suit la langue choisie. */
@Injectable()
export class TitreTraduit extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly transloco = inject(TranslocoService);
  private cle: string | undefined;

  constructor() {
    super();
    this.transloco.langChanges$.subscribe(() => this.afficher());
  }

  override updateTitle(etat: RouterStateSnapshot): void {
    this.cle = this.buildTitle(etat);
    this.afficher();
  }

  private afficher(): void {
    const nom = this.transloco.translate('app.nom');
    this.title.setTitle(this.cle ? `${this.transloco.translate(this.cle)} · ${nom}` : nom);
  }
}
