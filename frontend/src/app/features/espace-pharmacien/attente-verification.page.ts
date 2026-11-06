import { ChangeDetectionStrategy, Component, computed, inject, Injector } from '@angular/core';
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
  private readonly injecteur = inject(Injector);

  protected readonly outils = environment.outilsSimulation;
  protected readonly demande = toSignal(this.claims.maDemande());
  private readonly pharmacie = toSignal(
    toObservable(this.demande).pipe(
      switchMap((d) => (d?.pharmacieId ? this.api.obtenirPharmacie(d.pharmacieId) : of(undefined))),
    ),
  );
  protected readonly nom = computed(() => this.pharmacie()?.nom ?? this.demande()?.ajout?.nom ?? '');

  /** Raccourci de développement : chargé à la demande, il suit le vrai flux d'administration. */
  private async administration() {
    const { AdminClaimServiceSimule } = await import(
      '../administration/services/admin.simule'
    );
    return this.injecteur.get(AdminClaimServiceSimule);
  }

  protected async valider(): Promise<void> {
    const service = await this.administration();
    const motif = { code: 'pharmacie-attribuee' as const };
    await firstValueFrom(service.validerDemande(this.demande()?.id as string, motif));
    await this.router.navigate(['/pharmacien']);
  }

  protected async refuser(): Promise<void> {
    const service = await this.administration();
    const motif = { code: 'justificatif-illisible' as const, precision: 'Exemple de test.' };
    await firstValueFrom(service.refuserDemande(this.demande()?.id as string, motif));
    await this.router.navigate(['/pharmacien/reclamer']);
  }
}
