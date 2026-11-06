import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AUTH_SERVICE, ErreurAuth } from '../../core/services/auth.service';
import { Bouton } from '../../shared/bouton/bouton';
import { Icone } from '../../shared/icone/icone';
import { LienTestEmail } from './lien-test-email';

type Etat = 'attente' | 'verification' | 'succes' | 'expire' | 'invalide';

@Component({
  selector: 'app-verification-email-page',
  imports: [Bouton, Icone, LienTestEmail, NgTemplateOutlet, RouterLink, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verification-email.page.html',
  styleUrl: './page-compte.scss',
})
export class VerificationEmailPage {
  private readonly auth = inject(AUTH_SERVICE);

  protected readonly utilisateur = this.auth.utilisateur;
  protected readonly etat = signal<Etat>('attente');
  protected readonly renvoye = signal(false);
  protected readonly envoi = signal(false);
  protected readonly erreurRenvoi = signal(false);
  protected readonly version = signal(0);
  protected readonly dejaVerifie = computed(() => !!this.utilisateur()?.emailVerifie);
  protected readonly pharmacien = computed(() => this.utilisateur()?.role === 'pharmacien');
  private jeton: string | null = null;

  constructor() {
    inject(ActivatedRoute)
      .queryParamMap.pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.jeton = params.get('jeton');
        this.renvoye.set(false);
        if (this.jeton) {
          void this.verifier(this.jeton);
        } else {
          this.etat.set('attente');
        }
      });
  }

  protected async renvoyer(): Promise<void> {
    this.envoi.set(true);
    this.erreurRenvoi.set(false);
    try {
      await firstValueFrom(
        this.auth.renvoyerLien(this.etat() === 'expire' ? (this.jeton ?? undefined) : undefined),
      );
      this.renvoye.set(true);
      this.version.update((n) => n + 1);
    } catch {
      this.erreurRenvoi.set(true);
    } finally {
      this.envoi.set(false);
    }
  }

  private async verifier(jeton: string): Promise<void> {
    this.etat.set('verification');
    try {
      await firstValueFrom(this.auth.verifierEmail(jeton));
      this.etat.set('succes');
    } catch (erreur) {
      this.etat.set((erreur as ErreurAuth) === 'lien-expire' ? 'expire' : 'invalide');
    }
  }
}
