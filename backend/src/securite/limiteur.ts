import type { Limite } from '../config/configuration.js';

/**
 * Compteur à fenêtre glissante, en mémoire du processus.
 * Suffisant pour un seul serveur ; avec plusieurs instances, il faudra un stockage partagé.
 * La taille est bornée pour qu'un afflux d'adresses ou d'IP ne remplisse pas la mémoire.
 */
export class Limiteur {
  private readonly evenements = new Map<string, number[]>();
  private static readonly TAILLE_MAX = 50_000;

  constructor(private readonly limite: Limite) {}

  private recents(cle: string, maintenant: number): number[] {
    const liste = (this.evenements.get(cle) ?? []).filter((t) => maintenant - t < this.limite.fenetreMs);
    if (liste.length) this.evenements.set(cle, liste);
    else this.evenements.delete(cle);
    return liste;
  }

  /** Vrai si la clé a déjà atteint la limite. */
  estBloque(cle: string, maintenant = Date.now()): boolean {
    return this.recents(cle, maintenant).length >= this.limite.max;
  }

  /** Secondes avant qu'une nouvelle tentative soit possible (en-tête Retry-After). */
  attente(cle: string, maintenant = Date.now()): number {
    const liste = this.recents(cle, maintenant);
    if (liste.length < this.limite.max) return 0;
    return Math.ceil((liste[0] + this.limite.fenetreMs - maintenant) / 1000);
  }

  enregistrer(cle: string, maintenant = Date.now()): void {
    if (this.evenements.size >= Limiteur.TAILLE_MAX) this.purger(maintenant);
    const liste = this.recents(cle, maintenant);
    liste.push(maintenant);
    this.evenements.set(cle, liste);
  }

  effacer(cle: string): void {
    this.evenements.delete(cle);
  }

  private purger(maintenant: number): void {
    for (const cle of [...this.evenements.keys()]) this.recents(cle, maintenant);
    // Toujours plein : les plus anciennes clés partent (une Map garde l'ordre d'insertion).
    for (const cle of this.evenements.keys()) {
      if (this.evenements.size < Limiteur.TAILLE_MAX) break;
      this.evenements.delete(cle);
    }
  }
}
