import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, of } from 'rxjs';
import { COORDONNEES } from '../../core/coordonnees.config';
import {
  CONTACT_SERVICE,
  ErreurContact,
  SUJETS_CONTACT,
  SujetContact,
} from '../../core/services/contact.service';
import { PHARMACIE_API } from '../../core/services/pharmacie-api';
import { Bouton } from '../../shared/bouton/bouton';
import { Champ, Controle } from '../../shared/champ/champ';
import { Icone } from '../../shared/icone/icone';
import { AUCUNE_ERREUR, ErreursContact, MESSAGE_MAXIMUM, validerContact } from './contact.validation';

@Component({
  selector: 'app-contact-page',
  imports: [Bouton, Champ, Controle, Icone, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './contact.page.html',
  styleUrl: './contact.page.scss',
})
export class ContactPage {
  private readonly service = inject(CONTACT_SERVICE);
  private readonly api = inject(PHARMACIE_API);
  private readonly injecteur = inject(Injector);
  private readonly hote = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly parametres = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly confirmation = viewChild<ElementRef<HTMLElement>>('confirmation');

  protected readonly sujets = SUJETS_CONTACT;
  protected readonly coordonnees = COORDONNEES;
  protected readonly maximum = MESSAGE_MAXIMUM;
  protected readonly pharmacieId = this.parametres.get('pharmacie');
  /** Depuis une fiche : le sujet et la pharmacie sont déjà remplis. */
  protected readonly pharmacie = toSignal(
    this.pharmacieId ? this.api.obtenirPharmacie(this.pharmacieId) : of(undefined),
  );

  protected readonly nom = signal('');
  protected readonly email = signal('');
  protected readonly sujet = signal<SujetContact | ''>(this.sujetInitial());
  protected readonly message = signal('');
  protected readonly erreurs = signal<ErreursContact>(AUCUNE_ERREUR);
  protected readonly envoi = signal(false);
  /** Code de l'erreur d'envoi (message précis), ou null. */
  protected readonly echec = signal<ErreurContact | null>(null);
  protected readonly envoye = signal(false);

  protected async envoyer(evenement?: Event): Promise<void> {
    evenement?.preventDefault();
    // Un double clic arrive avant que l'écran change : on ne compte que le premier.
    if (this.envoi() || this.envoye()) {
      return;
    }
    const sujet = this.sujet();
    const erreurs = validerContact(this.email(), sujet, this.message());
    this.erreurs.set(erreurs);
    if (!sujet || erreurs.email || erreurs.sujet || erreurs.message) {
      afterNextRender(
        () => this.hote.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
        { injector: this.injecteur },
      );
      return;
    }
    this.envoi.set(true);
    this.echec.set(null);
    try {
      await firstValueFrom(
        this.service.envoyer({
          ...(this.nom().trim() ? { nom: this.nom().trim() } : {}),
          email: this.email().trim(),
          sujet,
          message: this.message().trim(),
          ...(this.pharmacie() ? { pharmacieId: this.pharmacie()?.id } : {}),
        }),
      );
      this.envoye.set(true);
      afterNextRender(() => this.confirmation()?.nativeElement.focus(), {
        injector: this.injecteur,
      });
    } catch (erreur) {
      this.echec.set((typeof erreur === 'string' ? erreur : 'indisponible') as ErreurContact);
    } finally {
      this.envoi.set(false);
    }
  }

  protected recommencer(): void {
    this.message.set('');
    this.envoye.set(false);
  }

  private sujetInitial(): SujetContact | '' {
    const sujet = this.parametres.get('sujet');
    return SUJETS_CONTACT.find((s) => s === sujet) ?? '';
  }
}
