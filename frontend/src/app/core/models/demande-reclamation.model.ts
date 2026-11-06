export type EtatDemande = 'en-attente' | 'validee' | 'refusee' | 'retiree';

/** Motifs traduits : le pharmacien les lit dans sa langue. */
export type MotifRefus =
  | 'justificatif-illisible'
  | 'informations-incompletes'
  | 'pharmacie-attribuee'
  | 'pharmacie-fermee'
  | 'compte-supprime'
  | 'autre';

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
  /** Message explicatif en cas de refus ou de retrait (F5). */
  motifCode?: MotifRefus;
  /** Précision libre, dans la langue de l'administrateur. */
  motifPrecision?: string;
  /** Pharmacie déjà réclamée par un autre compte : l'administrateur tranche. */
  conflit?: boolean;
  ajout?: PharmacieProposee;
  justificatif?: Justificatif;
}
