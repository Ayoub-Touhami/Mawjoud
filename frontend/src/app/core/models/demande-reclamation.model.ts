export type EtatDemande = 'en-attente' | 'validee' | 'refusee';

/** La méthode de vérification n'est pas décidée : tout est facultatif. */
export interface Justificatif {
  texte?: string;
  /** Seuls le nom et la taille sont gardés : jamais le contenu du fichier. */
  fichier?: { nom: string; taille: number };
}

/** Pharmacie absente de l'annuaire, proposée à l'administrateur. */
export interface PharmacieProposee {
  nom: string;
  adresse: string;
  ville: string;
  telephone: string;
}

export interface DemandeReclamation {
  id: string;
  /** null pour une demande d'ajout à l'annuaire. */
  pharmacieId: string | null;
  pharmacienId: string;
  etat: EtatDemande;
  /** Date de la demande, au format ISO 8601. */
  creeeLe: string;
  /** Message explicatif en cas de refus (F5). */
  motifRefus?: string;
  /** Pharmacie déjà réclamée par un autre compte : l'administrateur tranche. */
  conflit?: boolean;
  ajout?: PharmacieProposee;
  justificatif?: Justificatif;
}
