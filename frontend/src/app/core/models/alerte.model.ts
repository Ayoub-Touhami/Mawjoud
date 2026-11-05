export type EtatAlerte = 'active' | 'terminee';

export interface Alerte {
  id: string;
  utilisateurId: string;
  medicamentId: string;
  /** null signifie « toutes les villes ». */
  ville: string | null;
  etat: EtatAlerte;
}
