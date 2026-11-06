/** non-inscrite : annuaire seul ; reclamee : vérification en attente ; inscrite : compte vérifié. */
export type EtatPharmacie = 'non-inscrite' | 'reclamee' | 'inscrite';

/** Jours : 0 = dimanche, 6 = samedi. Heures au format HH:mm. */
export interface PlageHoraire {
  jours: number[];
  ouverture: string;
  fermeture: string;
}

export interface Pharmacie {
  id: string;
  nom: string;
  adresse: string;
  ville: string;
  codePostal?: string;
  gouvernorat: string;
  /** Vide si le numéro n'est pas connu. */
  telephone: string;
  /** Vide si les horaires ne sont pas connus. */
  horaires: PlageHoraire[];
  latitude: number;
  longitude: number;
  etat: EtatPharmacie;
  /** Origine de la donnée (spécification, section 10). */
  source: string;
  /** Position et statut simulés : la fiche l'indique clairement. */
  donneeTest?: boolean;
}
