import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom, Observable } from 'rxjs';
import { GOUVERNORATS } from '../../core/gouvernorats';
import { Bouton } from '../../shared/bouton/bouton';
import { Champ, Controle } from '../../shared/champ/champ';
import { CartePosition } from './carte-position';
import { ChampMotif, ConfirmationAdmin, DateFrPipe } from './composants-admin';
import {
  ADMIN_CLAIM_SERVICE,
  DemandeDetaillee,
  ErreurAdmin,
  MotifDecision,
} from './services/admin.contrats';

/** Position de départ d'une nouvelle fiche : Tunis, à ajuster sur la carte. */
const POSITION_DEPART = { latitude: 36.8065, longitude: 10.1815 };

type Decision =
  | { type: 'valider'; demande: DemandeDetaillee }
  | { type: 'refuser'; demande: DemandeDetaillee }
  | { type: 'refuser-tout' }
  | { type: 'ajout' };

@Component({
  selector: 'app-dossier-demande-page',
  imports: [
    Bouton,
    CartePosition,
    Champ,
    ChampMotif,
    ConfirmationAdmin,
    Controle,
    DateFrPipe,
    RouterLink,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dossier-demande.page.html',
  styleUrls: ['./admin-partage.scss', './dossier-demande.page.scss'],
})
export class DossierDemandePage {
  private readonly service = inject(ADMIN_CLAIM_SERVICE);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') as string;
  private readonly transloco = inject(TranslocoService);

  protected readonly gouvernorats = GOUVERNORATS;
  protected readonly dossier = signal<DemandeDetaillee[]>([]);
  protected readonly decision = signal<Decision | null>(null);
  protected readonly motif = signal<MotifDecision | null>(null);
  protected readonly motifManquant = signal(false);
  protected readonly erreur = signal<ErreurAdmin | null>(null);
  protected readonly termine = signal(false);

  protected readonly ajout = computed(() => this.dossier()[0]?.demande.ajout ?? null);
  protected readonly plusieurs = computed(() => this.dossier().length > 1);
  protected readonly enAttente = computed(() =>
    this.dossier().filter((d) => d.demande.etat === 'en-attente'),
  );
  protected readonly position = signal(POSITION_DEPART);
  protected readonly gouvernorat = signal('Tunis');

  /** Le texte dit ce qui va se passer, avant la confirmation. */
  protected readonly question = computed(() => {
    const decision = this.decision();
    if (!decision) {
      return '';
    }
    const texte = (cle: string) => this.transloco.translate(`admin.demandes.confirmer.${cle}`);
    if (decision.type === 'valider') {
      return texte(this.plusieurs() ? 'choisir' : 'valider');
    }
    return texte(decision.type);
  });

  constructor() {
    void this.charger();
  }

  protected ouvrir(decision: Decision): void {
    this.decision.set(decision);
    this.motif.set(null);
    this.motifManquant.set(false);
    this.erreur.set(null);
  }

  protected deplacer(latitude: number, longitude: number): void {
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      this.position.set({ latitude, longitude });
    }
  }

  protected motifDemande(): boolean {
    const decision = this.decision();
    return (
      decision?.type === 'refuser' ||
      decision?.type === 'refuser-tout' ||
      (decision?.type === 'valider' && this.plusieurs())
    );
  }

  protected async confirmer(): Promise<void> {
    const decision = this.decision();
    const motif = this.motif();
    if (!decision) {
      return;
    }
    if (this.motifDemande() && !motif) {
      this.motifManquant.set(true);
      return;
    }
    if (decision.type === 'valider') {
      await this.lancer(this.service.validerDemande(decision.demande.demande.id, motif ?? undefined));
    } else if (decision.type === 'refuser') {
      await this.lancer(this.service.refuserDemande(decision.demande.demande.id, motif as MotifDecision));
    } else if (decision.type === 'refuser-tout') {
      for (const { demande } of this.enAttente()) {
        await this.lancer(this.service.refuserDemande(demande.id, motif as MotifDecision));
      }
    } else {
      const ajout = this.ajout();
      if (ajout) {
        await this.lancer(
          this.service.creerFicheEtValider(this.id, {
            ...ajout,
            ...this.position(),
            gouvernorat: this.gouvernorat(),
          }),
        );
      }
    }
  }

  private async lancer(action: Observable<void>): Promise<void> {
    try {
      await firstValueFrom(action);
      this.decision.set(null);
      this.termine.set(true);
      await this.charger();
    } catch (erreur) {
      this.erreur.set(erreur as ErreurAdmin);
    }
  }

  private async charger(): Promise<void> {
    this.dossier.set(await firstValueFrom(this.service.obtenirDossier(this.id)));
  }
}
