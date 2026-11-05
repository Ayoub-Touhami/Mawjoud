import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { provideTranslocoLang } from '@jsverse/transloco';
import { Theme } from '../../core/services/theme.service';
import { DesignPanneau } from './design-panneau';

/** Fixent la langue d'un panneau, indépendamment de la langue active du site. */
@Component({
  selector: 'app-design-francais',
  imports: [DesignPanneau],
  providers: [provideTranslocoLang('fr')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-design-panneau langue="fr" [theme]="theme()" />`,
})
export class DesignFrancais {
  readonly theme = input.required<Theme>();
}

@Component({
  selector: 'app-design-arabe',
  imports: [DesignPanneau],
  providers: [provideTranslocoLang('ar')],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-design-panneau langue="ar" [theme]="theme()" />`,
})
export class DesignArabe {
  readonly theme = input.required<Theme>();
}
