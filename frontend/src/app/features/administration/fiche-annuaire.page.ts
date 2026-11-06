import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, Observable } from 'rxjs';
import { GOUVERNORATS } from '../../core/gouvernorats';
import { PlageHoraire } from '../../core/models';
import { Bouton } from '../../shared/bouton/bouton';
import { Champ, Controle } from '../../shared/champ/champ';
import { PastilleStatut } from '../../shared/pastille-statut/pastille-statut';
import { CartePosition } from './carte-position';
import { ChampMotif, ConfirmationAdmin } from './composants-admin';
import { FusionFiches } from './fusion-fiches';
import {
  ADMIN_DIRECTORY_SERVICE,
  ChampsFiche,
  ErreurAdmin,
  FicheAnnuaire,
  MotifDecision,
} from './services/admin.contrats';

const JOURS = [1, 2, 3, 4, 5, 6, 0];

@Component({
  selector: 'app-fiche-annuaire-page',
  imports: [
    Bouton,
    CartePosition,
    Champ,
    ChampMotif,
    ConfirmationAdmin,
    Controle,
    FusionFiches,
    PastilleStatut,
    RouterLink,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './fiche-annuaire.page.html',
  styleUrls: ['./admin-partage.scss', './fiche-annuaire.page.scss'],
})
export class FicheAnnuairePage {
  private readonly service = inject(ADMIN_DIRECTORY_SERVICE);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') as string;

  protected readonly gouvernorats = GOUVERNORATS;
  protected readonly jours = JOURS;
  protected readonly fiche = signal<FicheAnnuaire | null>(null);
  protected readonly champs = signal<ChampsFiche>({});
  protected readonly horaires = signal<PlageHoraire[]>([]);
  protected readonly confirmation = signal<'fermer' | 'retirer' | null>(null);
  protected readonly motif = signal<MotifDecision | null>(null);
  protected readonly motifManquant = signal(false);
  protected readonly erreur = signal<ErreurAdmin | null>(null);
  protected readonly enregistre = signal(false);
  protected readonly position = computed(() => ({
    latitude: this.champs().latitude ?? this.fiche()?.latitude ?? 0,
    longitude: this.champs().longitude ?? this.fiche()?.longitude ?? 0,
  }));

  constructor() {
    void this.charger();
  }

  protected changer(champ: keyof ChampsFiche, valeur: string | number): void {
    this.champs.update((c) => ({ ...c, [champ]: valeur }));
    this.enregistre.set(false);
  }

  protected ajouterPlage(): void {
    this.horaires.update((h) => [
      ...h,
      { jours: [1, 2, 3, 4, 5, 6], ouverture: '08:00', fermeture: '20:00' },
    ]);
  }

  protected modifierPlage(rang: number, changement: Partial<PlageHoraire>): void {
    this.horaires.update((h) => h.map((p, i) => (i === rang ? { ...p, ...changement } : p)));
  }

  protected basculerJour(rang: number, jour: number): void {
    const plage = this.horaires()[rang];
    const jours = plage.jours.includes(jour)
      ? plage.jours.filter((j) => j !== jour)
      : [...plage.jours, jour];
    this.modifierPlage(rang, { jours });
  }

  protected retirerPlage(rang: number): void {
    this.horaires.update((h) => h.filter((_, i) => i !== rang));
  }

  protected async enregistrer(): Promise<void> {
    const champs = { ...this.champs(), horaires: this.horaires() };
    if (await this.lancer(this.service.modifierFiche(this.id, champs))) {
      this.enregistre.set(true);
    }
  }

  protected ouvrir(confirmation: 'fermer' | 'retirer'): void {
    this.confirmation.set(confirmation);
    this.motif.set(null);
    this.motifManquant.set(false);
  }

  protected async rouvrir(): Promise<void> {
    await this.lancer(this.service.marquerFermee(this.id, false));
  }

  protected async confirmer(): Promise<void> {
    if (this.confirmation() === 'fermer') {
      await this.lancer(this.service.marquerFermee(this.id, true));
      return;
    }
    const motif = this.motif();
    if (!motif) {
      this.motifManquant.set(true);
      return;
    }
    await this.lancer(this.service.retirerInscription(this.id, motif));
  }

  protected async charger(): Promise<void> {
    const fiche = await firstValueFrom(this.service.obtenirFiche(this.id));
    this.fiche.set(fiche ?? null);
    this.horaires.set(fiche?.horaires ?? []);
    this.champs.set({});
  }

  private async lancer(action: Observable<void>): Promise<boolean> {
    this.erreur.set(null);
    try {
      await firstValueFrom(action);
      this.confirmation.set(null);
      await this.charger();
      return true;
    } catch (erreur) {
      this.erreur.set(erreur as ErreurAdmin);
      return false;
    }
  }
}
