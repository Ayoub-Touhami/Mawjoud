export interface Medicament {
  id: string;
  /** Nom commercial. */
  nom: string;
  /** Substance active (dénomination commune internationale). */
  dci: string;
  forme: string;
  dosage: string;
  categorie?: string;
  nomArabe?: string;
  dciArabe?: string;
  /** Vrai pour une donnée de test inventée. */
  donneeTest?: boolean;
}
