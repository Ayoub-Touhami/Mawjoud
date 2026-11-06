import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
  viewChild,
  ViewEncapsulation,
} from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import type { GeoJSONSource, Map as CarteMapLibre, MapMouseEvent } from 'maplibre-gl';
import { LangueService } from '../../core/i18n/langue.service';
import { Pharmacie } from '../../core/models';
import { Coordonnees } from '../../core/outils/pharmacie.outils';
import { ThemeService } from '../../core/services/theme.service';
import { calculerLimites, centreDe, contraindre, Limites, Marges } from './cadrage';
import { chargerMaplibre } from './charger-maplibre';
import { fournirImages, ImagesCarte, preparerImages } from './images-carte';
import {
  COUCHES_CLIQUABLES,
  donneesPharmacies,
  donneesPosition,
  donneesSelection,
  SOURCE_PHARMACIES,
  SOURCE_POSITION,
  SOURCE_SELECTION,
  styleAccueil,
} from './style-carte';

export type EtatCarte = 'chargement' | 'prete' | 'erreur-fond' | 'impossible';

interface ElementVisible {
  cle: string;
  libelle: string;
  action: () => void;
}

const LARGEUR_ORDINATEUR = 860;
const ZOOM_MAXIMAL = 18;
const ZOOM_POSITION = 13;
/** Assez près pour que la pharmacie choisie sorte de sa grappe. */
const ZOOM_SELECTION = 14.5;
/** Cible tactile de 44 px autour du point touché. */
const RAYON_TACTILE = 22;
/** Le corps du marqueur est au-dessus du point géographique. */
const HAUTEUR_CENTRE_MARQUEUR = 20;
/** Décalage de la pharmacie choisie pour rester visible à côté du panneau d'ordinateur. */
const DECALAGE_PANNEAU = 190;
const MAX_ELEMENTS_CLAVIER = 30;

/** Carte MapLibre de la Tunisie. La bibliothèque reste enfermée dans ce composant. */
@Component({
  selector: 'app-carte-tunisie',
  imports: [TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './carte-tunisie.html',
  styleUrl: './carte-tunisie.scss',
})
export class CarteTunisie {
  readonly pharmacies = input.required<Pharmacie[]>();
  readonly position = input<Coordonnees | null>(null);
  readonly selection = model<Pharmacie | null>(null);
  readonly etat = output<EtatCarte>();

  private readonly theme = inject(ThemeService).theme;
  private readonly langue = inject(LangueService).langue;
  private readonly transloco = inject(TranslocoService);
  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');

  private carte: CarteMapLibre | null = null;
  private images: ImagesCarte | null = null;
  private limites: Limites | null = null;
  private fenetre = { largeur: 0, hauteur: 0 };
  /** Une panne reste signalée après la fin du chargement, jusqu'à une nouvelle tentative. */
  private panneFond = false;
  private readonly prete = signal(false);
  private readonly index = computed(() => new Map(this.pharmacies().map((p) => [p.id, p])));

  protected readonly visibles = signal<ElementVisible[]>([]);

  constructor() {
    afterNextRender(() => void this.creer());
    inject(DestroyRef).onDestroy(() => this.carte?.remove());

    effect(() => {
      const donnees = donneesPharmacies(this.pharmacies());
      if (this.prete()) {
        this.source(SOURCE_PHARMACIES)?.setData(donnees);
      }
    });
    effect(() => {
      const donnees = donneesPosition(this.position());
      if (this.prete()) {
        this.source(SOURCE_POSITION)?.setData(donnees);
      }
    });
    effect(() => {
      const pharmacie = this.selection();
      if (this.prete()) {
        this.source(SOURCE_SELECTION)?.setData(donneesSelection(pharmacie));
        if (pharmacie) {
          // Après le prochain affichage : sur mobile, la feuille réduit la hauteur de la carte.
          requestAnimationFrame(() => this.montrer(pharmacie));
        }
      }
    });
    effect(() => {
      this.theme();
      this.langue();
      if (this.prete()) {
        void this.redessiner();
      }
    });
  }

  zoomer(ecart: number): void {
    if (ecart > 0) {
      this.carte?.zoomIn();
    } else {
      this.carte?.zoomOut();
    }
  }

  allerA({ latitude, longitude }: Coordonnees): void {
    this.carte?.easeTo({
      center: [longitude, latitude],
      zoom: Math.max(this.carte.getZoom(), ZOOM_POSITION),
    });
  }

  /** Cadre un ensemble de pharmacies, par exemple celles d'une ville. */
  cadrer(pharmacies: Pharmacie[]): void {
    const [premiere] = pharmacies;
    const carte = this.carte;
    if (!premiere || !carte) {
      return;
    }
    const lngs = pharmacies.map((p) => p.longitude);
    const lats = pharmacies.map((p) => p.latitude);
    carte.fitBounds(
      [
        [Math.min(...lngs), Math.min(...lats)],
        [Math.max(...lngs), Math.max(...lats)],
      ],
      { padding: 80, maxZoom: 14 },
    );
  }

  /** Relance le chargement du fond après une erreur. */
  recharger(): void {
    if (this.carte) {
      this.panneFond = false;
      this.etat.emit('chargement');
      void this.redessiner();
    }
  }

  private async creer(): Promise<void> {
    try {
      const [maplibre, images] = await Promise.all([chargerMaplibre(), preparerImages()]);
      this.images = images;
      const element = this.surface().nativeElement;
      this.mesurer(element);
      const limites = this.limites as Limites;
      const centre = centreDe(limites);
      const carte = new maplibre.Map({
        container: element,
        style: this.style(),
        center: [centre.longitude, centre.latitude],
        zoom: limites.zoomMinimal,
        minZoom: limites.zoomMinimal,
        maxZoom: ZOOM_MAXIMAL,
        renderWorldCopies: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        attributionControl: { compact: false },
        locale: { 'Map.Title': this.transloco.translate('carte.regionCarte') },
        transformConstrain: (centreDemande, zoom) => {
          const vue = contraindre(
            this.limites as Limites,
            element.clientWidth,
            element.clientHeight,
            { longitude: centreDemande.lng, latitude: centreDemande.lat },
            zoom,
          );
          return {
            center: new maplibre.LngLat(vue.longitude, vue.latitude),
            zoom: vue.zoom,
          };
        },
      });
      this.carte = carte;
      carte.touchZoomRotate.disableRotation();
      carte.keyboard.disableRotation();
      fournirImages(carte, () => this.images as ImagesCarte);
      carte.on('load', () => {
        this.prete.set(true);
        this.annoncerFin();
      });
      carte.on('error', ({ error }) => this.signalerErreur(error as { status?: number }));
      carte.on('click', (evenement) => this.cliquer(evenement));
      carte.on('mousemove', ({ point }) => {
        const survol = carte.queryRenderedFeatures(point, { layers: COUCHES_CLIQUABLES }).length;
        carte.getCanvas().style.cursor = survol ? 'pointer' : '';
      });
      carte.on('idle', () => this.listerVisibles());
      carte.on('resize', () => this.adapter(element));
    } catch {
      this.etat.emit('impossible');
    }
  }

  private style() {
    return styleAccueil({
      theme: untracked(this.theme),
      langue: untracked(this.langue),
      pharmacies: untracked(this.pharmacies),
      selection: untracked(this.selection),
      position: untracked(this.position),
    });
  }

  private annoncerFin(): void {
    this.etat.emit(this.panneFond ? 'erreur-fond' : 'prete');
  }

  private async redessiner(): Promise<void> {
    this.images = await preparerImages();
    this.carte?.setStyle(this.style(), { diff: false });
    this.carte?.once('idle', () => this.annoncerFin());
  }

  private source(id: string): GeoJSONSource | undefined {
    return this.carte?.getSource<GeoJSONSource>(id);
  }

  private marges(largeur: number): Marges {
    return largeur < LARGEUR_ORDINATEUR
      ? { haut: 170, bas: 36, gauche: 12, droite: 12 }
      : { haut: 32, bas: 40, gauche: 32, droite: 32 };
  }

  private mesurer(element: HTMLElement): void {
    const largeur = element.clientWidth;
    const hauteur = element.clientHeight;
    this.fenetre = { largeur: window.innerWidth, hauteur: window.innerHeight };
    this.limites = calculerLimites(largeur, hauteur, this.marges(largeur));
  }

  /** La feuille du bas réduit aussi la carte : seul un changement de fenêtre refait le cadrage. */
  private adapter(element: HTMLElement): void {
    const { largeur, hauteur } = this.fenetre;
    if (window.innerWidth === largeur && window.innerHeight === hauteur) {
      return;
    }
    this.mesurer(element);
    const carte = this.carte;
    if (carte && this.limites) {
      carte.setMinZoom(this.limites.zoomMinimal);
      carte.jumpTo({ center: carte.getCenter() });
    }
  }

  private signalerErreur(erreur: { status?: number }): void {
    // Une tuile absente est normale au bord du pays : seule une panne du fond est signalée.
    if (erreur.status !== 404) {
      this.panneFond = true;
      this.etat.emit('erreur-fond');
    }
  }

  private cliquer({ point: { x, y } }: MapMouseEvent): void {
    const carte = this.carte;
    if (!carte) {
      return;
    }
    const trouves = carte.queryRenderedFeatures(
      [
        [x - RAYON_TACTILE, y - RAYON_TACTILE],
        [x + RAYON_TACTILE, y + RAYON_TACTILE],
      ],
      { layers: COUCHES_CLIQUABLES },
    );
    const eloignement = (element: (typeof trouves)[number]) => {
      const [lng, lat] = (element.geometry as GeoJSON.Point).coordinates;
      const ecran = carte.project([lng, lat]);
      const decalage = element.properties['cluster'] ? 0 : HAUTEUR_CENTRE_MARQUEUR;
      return Math.hypot(ecran.x - x, ecran.y - decalage - y);
    };
    const proche = trouves.sort((a, b) => eloignement(a) - eloignement(b))[0];
    if (!proche) {
      this.selection.set(null);
    } else if (proche.properties['cluster']) {
      void this.ouvrirGrappe(proche.properties['cluster_id'], proche.geometry as GeoJSON.Point);
    } else {
      this.selection.set(this.index().get(proche.properties['id']) ?? null);
    }
  }

  private async ouvrirGrappe(id: number, point: GeoJSON.Point): Promise<void> {
    const zoom = await this.source(SOURCE_PHARMACIES)?.getClusterExpansionZoom(id);
    if (zoom !== undefined) {
      this.carte?.easeTo({
        center: point.coordinates as [number, number],
        zoom: zoom + 0.25,
      });
    }
  }

  private montrer(pharmacie: Pharmacie): void {
    const large = window.innerWidth >= LARGEUR_ORDINATEUR;
    const sens = document.documentElement.dir === 'rtl' ? 1 : -1;
    this.carte?.easeTo({
      center: [pharmacie.longitude, pharmacie.latitude],
      zoom: Math.max(this.carte.getZoom(), ZOOM_SELECTION),
      offset: [large ? sens * DECALAGE_PANNEAU : 0, 0],
      duration: 400,
    });
  }

  /** Une carte dessinée n'a pas de focus : ces boutons donnent le même accès au clavier. */
  private listerVisibles(): void {
    const carte = this.carte;
    if (!carte?.getLayer(COUCHES_CLIQUABLES[0])) {
      return;
    }
    const vus = new Set<string>();
    const elements: ElementVisible[] = [];
    for (const element of carte.queryRenderedFeatures({ layers: COUCHES_CLIQUABLES })) {
      const proprietes = element.properties;
      const cle = String(proprietes['cluster_id'] ?? proprietes['id']);
      if (vus.has(cle) || elements.length >= MAX_ELEMENTS_CLAVIER) {
        continue;
      }
      vus.add(cle);
      elements.push(
        proprietes['cluster']
          ? {
              cle,
              libelle: this.transloco.translate('carte.acces.grappe', {
                nombre: proprietes['point_count'],
              }),
              action: () =>
                void this.ouvrirGrappe(proprietes['cluster_id'], element.geometry as GeoJSON.Point),
            }
          : {
              cle,
              libelle: proprietes['nom'],
              action: () => this.selection.set(this.index().get(proprietes['id']) ?? null),
            },
      );
    }
    this.visibles.set(elements);
  }
}
