import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, map } from 'rxjs';
import { GOUVERNORATS } from '../../core/gouvernorats';
import { Alerte } from '../../core/models';
import { libelleMedicament } from '../../core/outils/recherche.outils';
import { ALERT_SERVICE, ErreurAlerte } from '../../core/services/alert.service';
import { PHARMACIE_API } from '../../core/services/pharmacie-api';
import { Bouton } from '../../shared/bouton/bouton';
import { Champ, Controle } from '../../shared/champ/champ';
import { Icone } from '../../shared/icone/icone';

/** Valeur du sélecteur pour « toutes les villes ». */
const TOUTES = '';

@Component({
  selector: 'app-mes-alertes-page',
  imports: [Bouton, Champ, Controle, Icone, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './mes-alertes.page.html',
  styleUrl: './mes-alertes.page.scss',
})
export class MesAlertesPage {
  private readonly service = inject(ALERT_SERVICE);
  private readonly medicaments = toSignal(
    inject(PHARMACIE_API)
      .listerMedicaments()
      .pipe(map((liste) => new Map(liste.map((m) => [m.id, libelleMedicament(m)])))),
  );

  protected readonly gouvernorats = GOUVERNORATS;
  protected readonly toutes = TOUTES;
  protected readonly alertes = signal<Alerte[]>([]);
  protected readonly chargee = signal(false);
  protected readonly enEdition = signal<string | null>(null);
  protected readonly zoneEditee = signal(TOUTES);
  protected readonly aSupprimer = signal<string | null>(null);
  protected readonly erreur = signal<{ id: string; code: ErreurAlerte } | null>(null);
  protected readonly lignes = computed(() =>
    this.alertes().map((alerte) => ({
      alerte,
      nom: this.medicaments()?.get(alerte.medicamentId) ?? alerte.medicamentId,
    })),
  );

  constructor() {
    void this.charger();
  }

  protected modifier(alerte: Alerte): void {
    this.aSupprimer.set(null);
    this.erreur.set(null);
    this.zoneEditee.set(alerte.ville ?? TOUTES);
    this.enEdition.set(alerte.id);
  }

  protected async enregistrer(alerte: Alerte): Promise<void> {
    try {
      await firstValueFrom(this.service.modifierAlerte(alerte.id, this.zoneEditee() || null));
      this.enEdition.set(null);
      await this.charger();
    } catch (erreur) {
      this.erreur.set({ id: alerte.id, code: erreur as ErreurAlerte });
    }
  }

  protected demanderSuppression(id: string): void {
    this.enEdition.set(null);
    this.erreur.set(null);
    this.aSupprimer.set(id);
  }

  protected async supprimer(id: string): Promise<void> {
    await firstValueFrom(this.service.supprimerAlerte(id));
    this.aSupprimer.set(null);
    await this.charger();
  }

  private async charger(): Promise<void> {
    this.alertes.set(await firstValueFrom(this.service.listerAlertes()));
    this.chargee.set(true);
  }
}
