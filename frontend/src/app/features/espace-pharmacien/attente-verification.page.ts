import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, of, switchMap } from 'rxjs';
import { CLAIM_SERVICE } from '../../core/services/claim.service';
import { PHARMACIE_API } from '../../core/services/pharmacie-api';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { environment } from '../../../environments/environment';
import { EtapesPharmacien } from './etapes-pharmacien';

/** Motif affiché par le bouton de refus réservé au développement. */
const MOTIF_TEST = 'Justificatif illisible (exemple de test).';

@Component({
  selector: 'app-attente-verification-page',
  imports: [Bouton, EtapesPharmacien, Icone, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './attente-verification.page.html',
  styleUrls: ['./page-pharmacien.scss', './attente-verification.page.scss'],
})
export class AttenteVerificationPage {
  private readonly claims = inject(CLAIM_SERVICE);
  private readonly api = inject(PHARMACIE_API);
  private readonly router = inject(Router);

  protected readonly outils = environment.outilsSimulation;
  protected readonly demande = toSignal(this.claims.maDemande());
  private readonly pharmacie = toSignal(
    toObservable(this.demande).pipe(
      switchMap((d) => (d?.pharmacieId ? this.api.obtenirPharmacie(d.pharmacieId) : of(undefined))),
    ),
  );
  protected readonly nom = computed(() => this.pharmacie()?.nom ?? this.demande()?.ajout?.nom ?? '');

  protected async valider(): Promise<void> {
    await firstValueFrom(this.claims.validerDemande(this.demande()?.id as string));
    await this.router.navigate(['/pharmacien']);
  }

  protected async refuser(): Promise<void> {
    await firstValueFrom(this.claims.refuserDemande(this.demande()?.id as string, MOTIF_TEST));
    await this.router.navigate(['/pharmacien/reclamer']);
  }
}
