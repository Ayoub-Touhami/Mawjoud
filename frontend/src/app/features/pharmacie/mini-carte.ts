import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { Map as CarteMapLibre } from 'maplibre-gl';
import { LangueService } from '../../core/i18n/langue.service';
import { Pharmacie } from '../../core/models';
import { ThemeService } from '../../core/services/theme.service';
import { chargerMaplibre } from '../carte/charger-maplibre';
import { fournirImages, ImagesCarte, preparerImages } from '../carte/images-carte';
import { styleFiche } from '../carte/style-carte';

const ZOOM_FICHE = 15;

/** Vue fixe de l'emplacement. Si le fond échoue, la page reste complète sans lui. */
@Component({
  selector: 'app-mini-carte',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #surface class="surface" role="img" [attr.aria-label]="libelle()"></div>`,
  styles: `
    :host {
      display: block;
      block-size: 100%;
      background: var(--fond);
    }

    .surface {
      block-size: 100%;
    }
  `,
})
export class MiniCarte {
  readonly pharmacie = input.required<Pharmacie>();
  readonly libelle = input.required<string>();

  private readonly theme = inject(ThemeService).theme;
  private readonly langue = inject(LangueService).langue;
  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');
  private readonly prete = signal(false);
  private carte: CarteMapLibre | null = null;
  private images: ImagesCarte | null = null;

  constructor() {
    afterNextRender(() => void this.creer());
    inject(DestroyRef).onDestroy(() => this.carte?.remove());
    effect(() => {
      const style = styleFiche(this.theme(), this.langue(), this.pharmacie());
      if (this.prete()) {
        void preparerImages().then((images) => {
          this.images = images;
          this.carte?.setStyle(style, { diff: false });
          const { longitude, latitude } = untracked(this.pharmacie);
          this.carte?.jumpTo({ center: [longitude, latitude] });
        });
      }
    });
  }

  private async creer(): Promise<void> {
    try {
      const [maplibre, images] = await Promise.all([chargerMaplibre(), preparerImages()]);
      this.images = images;
      const pharmacie = this.pharmacie();
      const carte = new maplibre.Map({
        container: this.surface().nativeElement,
        style: styleFiche(this.theme(), this.langue(), pharmacie),
        center: [pharmacie.longitude, pharmacie.latitude],
        zoom: ZOOM_FICHE,
        interactive: false,
        attributionControl: { compact: false },
      });
      this.carte = carte;
      fournirImages(carte, () => this.images as ImagesCarte);
      carte.on('load', () => this.prete.set(true));
    } catch {
      this.carte = null;
    }
  }
}
