export type EtatDemande = 'en-attente' | 'validee' | 'refusee';

export interface DemandeReclamation {
  id: string;
  pharmacieId: string;
  pharmacienId: string;
  etat: EtatDemande;
  /** Date de la demande, au format ISO 8601. */
  creeeLe: string;
  /** Message explicatif en cas de refus (F5). */
  motifRefus?: string;
}
