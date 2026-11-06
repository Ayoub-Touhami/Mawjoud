import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { debounceTime, firstValueFrom, Observable, switchMap } from 'rxjs';
import { DemandeReclamation, Justificatif, Pharmacie } from '../../core/models';
import { LONGUEUR_MINIMALE, normaliser } from '../../core/outils/recherche.outils';
import { CLAIM_SERVICE } from '../../core/services/claim.service';
import { Bouton } from '../../shared/bouton/bouton';
import { Champ, Controle } from '../../shared/champ/champ';
import { Icone } from '../../shared/icone/icone';
import { ChampJustificatif } from './champ-justificatif';
import { EtapesPharmacien } from './etapes-pharmacien';

const ATTENTE_FRAPPE_MS = 120;

@Component({
  selector: 'app-reclamer-pharmacie-page',
  imports: [
    Bouton,
    Champ,
    ChampJustificatif,
    Controle,
    EtapesPharmacien,
    Icone,
    TranslocoPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './reclamer-pharmacie.page.html',
  styleUrls: ['./page-pharmacien.scss', './reclamer-pharmacie.page.scss'],
})
export class ReclamerPharmaciePage {
  private readonly claims = inject(CLAIM_SERVICE);
  private readonly router = inject(Router);

  protected readonly texte = signal('');
  protected readonly choisie = signal<Pharmacie | null>(null);
  protected readonly justificatif = signal<Justificatif>({});
  protected readonly envoi = signal(false);
  protected readonly echec = signal(false);
  protected readonly ajout = signal(false);
  protected readonly nom = signal('');
  protected readonly adresse = signal('');
  protected readonly ville = signal('');
  protected readonly telephone = signal('');
  protected readonly champsManquants = signal(false);

  /** Motif du dernier refus, à montrer avant une nouvelle réclamation (F5). */
  protected readonly demande = toSignal(this.claims.maDemande());
  protected readonly resultats = toSignal(
    toObservable(this.texte).pipe(
      debounceTime(ATTENTE_FRAPPE_MS),
      switchMap((texte) => this.claims.chercherPharmacies(texte)),
    ),
    { initialValue: [] as Pharmacie[] },
  );
  protected readonly assezLong = computed(
    () => normaliser(this.texte()).length >= LONGUEUR_MINIMALE,
  );

  protected saisir(texte: string): void {
    this.texte.set(texte);
    this.choisie.set(null);
  }

  protected reclamer(pharmacie: Pharmacie): void {
    void this.envoyer(this.claims.reclamer(pharmacie.id, this.justificatif()));
  }

  protected demanderAjout(evenement: Event): void {
    evenement.preventDefault();
    const nom = this.nom().trim();
    const adresse = this.adresse().trim();
    const ville = this.ville().trim();
    this.champsManquants.set(!nom || !adresse || !ville);
    if (nom && adresse && ville) {
      const pharmacie = { nom, adresse, ville, telephone: this.telephone().trim() };
      void this.envoyer(this.claims.demanderAjout(pharmacie, this.justificatif()));
    }
  }

  private async envoyer(demande: Observable<DemandeReclamation>): Promise<void> {
    this.envoi.set(true);
    this.echec.set(false);
    try {
      await firstValueFrom(demande);
      await this.router.navigate(['/pharmacien/attente']);
    } catch {
      this.echec.set(true);
    } finally {
      this.envoi.set(false);
    }
  }
}
