import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, Observable } from 'rxjs';
import { Signalement } from '../../core/models';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { ConfirmationAdmin, DateFrPipe } from './composants-admin';
import { ADMIN_ABUSE_SERVICE, ComptePharmacien } from './services/admin.contrats';

type Action = 'suspendre' | 'supprimer';

@Component({
  selector: 'app-signalements-page',
  imports: [Bouton, ConfirmationAdmin, DateFrPipe, Icone, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './signalements.page.html',
  styleUrl: './admin-partage.scss',
})
export class SignalementsPage {
  private readonly service = inject(ADMIN_ABUSE_SERVICE);

  protected readonly signalements = signal<Signalement[]>([]);
  protected readonly comptes = signal<ComptePharmacien[]>([]);
  protected readonly enCours = signal<{ id: string; action: Action } | null>(null);
  protected readonly emails = computed(
    () => new Map(this.comptes().map((c) => [c.id, c.email] as const)),
  );

  constructor() {
    void this.charger();
  }

  protected async retablir(id: string): Promise<void> {
    await this.lancer(this.service.retablir(id));
  }

  protected async confirmer(): Promise<void> {
    const decision = this.enCours();
    if (decision) {
      await this.lancer(
        decision.action === 'suspendre'
          ? this.service.suspendre(decision.id)
          : this.service.supprimerCompte(decision.id),
      );
    }
  }

  private async lancer(action: Observable<void>): Promise<void> {
    await firstValueFrom(action);
    this.enCours.set(null);
    await this.charger();
  }

  private async charger(): Promise<void> {
    this.signalements.set(await firstValueFrom(this.service.listerSignalements()));
    this.comptes.set(await firstValueFrom(this.service.listerComptes()));
  }
}
