import { inject, Injectable } from '@angular/core';
import { defer, from, Observable, throwError } from 'rxjs';
import { Utilisateur } from '../models';
import { AuthService, ErreurAuth } from '../services/auth.service';
import { SessionService } from '../services/session.service';
import { CompteSimule, StockageSimulation } from './stockage-simulation';

/** Durée de validité du lien de vérification (décision du 6 novembre 2026). */
export const DUREE_LIEN_MS = 24 * 60 * 60 * 1000;

function normaliserEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * HACHAGE PROVISOIRE, pour la simulation seulement. Il évite d'écrire le mot de passe en clair,
 * mais SHA-256 est trop rapide pour protéger de vrais comptes : le back-end devra utiliser un
 * algorithme adapté aux mots de passe.
 */
async function hacher(motDePasse: string, sel: string): Promise<string> {
  const octets = new TextEncoder().encode(`${sel}:${motDePasse}`);
  const empreinte = await crypto.subtle.digest('SHA-256', octets);
  return [...new Uint8Array(empreinte)].map((o) => o.toString(16).padStart(2, '0')).join('');
}

function versUtilisateur(compte: CompteSimule): Utilisateur {
  return {
    id: compte.id,
    email: compte.email,
    role: 'patient',
    emailVerifie: compte.emailVerifie,
  };
}

/** SIMULATION : aucun e-mail ne part. Le lien de test est lu par l'écran de développement. */
@Injectable({ providedIn: 'root' })
export class AuthServiceSimule implements AuthService {
  private readonly stockage = inject(StockageSimulation);
  private readonly session = inject(SessionService);

  readonly utilisateur = this.session.utilisateur;

  constructor() {
    const compte = this.stockage.comptes.find((c) => c.id === this.stockage.sessionId);
    if (compte) {
      this.session.ouvrir(versUtilisateur(compte));
    }
  }

  creerCompte(email: string, motDePasse: string): Observable<Utilisateur> {
    return defer(() => from(this.creer(normaliserEmail(email), motDePasse)));
  }

  seConnecter(email: string, motDePasse: string): Observable<Utilisateur> {
    return defer(() => from(this.connecter(normaliserEmail(email), motDePasse)));
  }

  seDeconnecter(): void {
    this.stockage.enregistrer({ sessionId: null });
    this.session.fermer();
  }

  verifierEmail(jeton: string): Observable<void> {
    return defer(() => from(this.verifier(jeton)));
  }

  renvoyerLien(jetonExpire?: string): Observable<void> {
    const id = this.utilisateur()?.id;
    const compte = this.stockage.comptes.find((c) =>
      jetonExpire ? c.jetonVerification === jetonExpire : c.id === id,
    );
    if (!compte) {
      return throwError(() => 'lien-invalide' satisfies ErreurAuth);
    }
    return defer(async () => this.preparerLien(compte));
  }

  supprimerCompte(): Observable<void> {
    const id = this.utilisateur()?.id;
    if (!id) {
      return throwError(() => 'non-connecte' satisfies ErreurAuth);
    }
    return defer(async () => {
      this.stockage.enregistrer({
        comptes: this.stockage.comptes.filter((c) => c.id !== id),
        alertes: this.stockage.alertes.filter((a) => a.utilisateurId !== id),
        sessionId: null,
      });
      this.session.fermer();
    });
  }

  /** Jeton du lien en attente pour le compte connecté, ou d'un compte donné. */
  jetonEnAttente(jetonConnu?: string | null): string | null {
    const id = this.utilisateur()?.id;
    return (
      this.stockage.comptes.find((c) =>
        jetonConnu ? c.jetonVerification === jetonConnu : c.id === id,
      )?.jetonVerification ?? null
    );
  }

  /** Pour l'écran de développement : fait expirer le lien sans attendre 24 h. */
  expirerLien(jeton: string): void {
    this.modifier(jeton, { expirationJeton: 0 });
  }

  private async creer(email: string, motDePasse: string): Promise<Utilisateur> {
    if (this.stockage.comptes.some((c) => c.email === email)) {
      throw 'email-utilise' satisfies ErreurAuth;
    }
    const sel = crypto.randomUUID();
    const compte: CompteSimule = {
      id: crypto.randomUUID(),
      email,
      sel,
      empreinte: await hacher(motDePasse, sel),
      emailVerifie: false,
      jetonVerification: crypto.randomUUID(),
      expirationJeton: Date.now() + DUREE_LIEN_MS,
      jetonDesabonnement: crypto.randomUUID(),
    };
    this.stockage.enregistrer({
      comptes: [...this.stockage.comptes, compte],
      sessionId: compte.id,
    });
    const utilisateur = versUtilisateur(compte);
    this.session.ouvrir(utilisateur);
    return utilisateur;
  }

  private async connecter(email: string, motDePasse: string): Promise<Utilisateur> {
    const compte = this.stockage.comptes.find((c) => c.email === email);
    if (!compte || compte.empreinte !== (await hacher(motDePasse, compte.sel))) {
      throw 'identifiants' satisfies ErreurAuth;
    }
    this.stockage.enregistrer({ sessionId: compte.id });
    const utilisateur = versUtilisateur(compte);
    this.session.ouvrir(utilisateur);
    return utilisateur;
  }

  private async verifier(jeton: string): Promise<void> {
    const compte = this.stockage.comptes.find((c) => c.jetonVerification === jeton);
    if (!compte) {
      throw 'lien-invalide' satisfies ErreurAuth;
    }
    if (Date.now() > compte.expirationJeton) {
      throw 'lien-expire' satisfies ErreurAuth;
    }
    this.modifier(jeton, { emailVerifie: true, jetonVerification: null, expirationJeton: 0 });
    if (this.utilisateur()?.id === compte.id) {
      this.session.ouvrir(versUtilisateur({ ...compte, emailVerifie: true }));
    }
  }

  /** Un nouveau lien annule le précédent. */
  private preparerLien(compte: CompteSimule): void {
    this.stockage.enregistrer({
      comptes: this.stockage.comptes.map((c) =>
        c.id === compte.id
          ? {
              ...c,
              jetonVerification: crypto.randomUUID(),
              expirationJeton: Date.now() + DUREE_LIEN_MS,
            }
          : c,
      ),
    });
  }

  private modifier(jeton: string, changement: Partial<CompteSimule>): void {
    this.stockage.enregistrer({
      comptes: this.stockage.comptes.map((c) =>
        c.jetonVerification === jeton ? { ...c, ...changement } : c,
      ),
    });
  }
}
