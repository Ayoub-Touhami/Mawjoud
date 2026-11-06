import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import type { GeoJSONSource, Map as CarteMapLibre } from 'maplibre-gl';
import { LangueService } from '../../core/i18n/langue.service';
import { Pharmacie } from '../../core/models';
import { Coordonnees } from '../../core/outils/pharmacie.outils';
import { ThemeService } from '../../core/services/theme.service';
import { dansTunisie } from '../carte/cadrage';
import { chargerMaplibre } from '../carte/charger-maplibre';
import { fournirImages, ImagesCarte, preparerImages } from '../carte/images-carte';
import { donneesSelection, SOURCE_SELECTION, styleFiche } from '../carte/style-carte';

const ZOOM_POSITION = 15;

/** Un clic repositionne la pharmacie. Les champs de la fiche restent le chemin au clavier. */
@Component({
  selector: 'app-carte-position',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div #surface class="surface"></div>
    <p class="aide">{{ 'admin.fiche.positionAide' | transloco }}</p>
    @if (hors()) {
      <p class="erreur" role="alert">{{ 'admin.erreurs.hors-tunisie' | transloco }}</p>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: var(--e-2);
    }

    .surface {
      position: relative;
      block-size: 280px;
      overflow: hidden;
      background: var(--fond);
      border-radius: var(--rayon);
    }

    .aide,
    .erreur {
      margin-block: 0;
      font-size: 14px;
      color: var(--texte-secondaire);
    }

    .erreur {
      color: var(--erreur);
    }
  `,
})
export class CartePosition {
  readonly position = input.required<Coordonnees>();
  readonly deplacer = output<Coordonnees>();

  private readonly theme = inject(ThemeService).theme;
  private readonly langue = inject(LangueService).langue;
  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');
  private readonly prete = signal(false);
  private carte: CarteMapLibre | null = null;
  private images: ImagesCarte | null = null;

  protected readonly hors = signal(false);

  constructor() {
    afterNextRender(() => void this.creer());
    inject(DestroyRef).onDestroy(() => this.carte?.remove());
    effect(() => {
      const point = this.fiche();
      if (this.prete()) {
        this.carte?.getSource<GeoJSONSource>(SOURCE_SELECTION)?.setData(donneesSelection(point));
      }
    });
  }

  private fiche(): Pharmacie {
    return { ...this.position(), id: 'position', etat: 'inscrite' } as Pharmacie;
  }

  private async creer(): Promise<void> {
    try {
      const [maplibre, images] = await Promise.all([chargerMaplibre(), preparerImages()]);
      this.images = images;
      const point = untracked(() => this.fiche());
      const carte = new maplibre.Map({
        container: this.surface().nativeElement,
        style: styleFiche(this.theme(), this.langue(), point),
        center: [point.longitude, point.latitude],
        zoom: ZOOM_POSITION,
        attributionControl: { compact: false },
      });
      this.carte = carte;
      fournirImages(carte, () => this.images as ImagesCarte);
      carte.on('load', () => this.prete.set(true));
      carte.on('click', ({ lngLat }) => {
        const position = { latitude: lngLat.lat, longitude: lngLat.lng };
        this.hors.set(!dansTunisie(position));
        if (!this.hors()) {
          this.deplacer.emit(position);
        }
      });
    } catch {
      this.carte = null;
    }
  }
}
