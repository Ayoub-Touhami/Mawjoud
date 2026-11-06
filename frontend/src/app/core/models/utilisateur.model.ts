export type Role = 'patient' | 'pharmacien' | 'administrateur';

/** Aucun mot de passe ici : il ne quitte jamais le serveur. */
export interface Utilisateur {
  id: string;
  email: string;
  role: Role;
  emailVerifie: boolean;
  /** Pharmacien uniquement. */
  compteVerifie?: boolean;
  /** Pharmacien uniquement. */
  pharmacieId?: string;
  /** Pharmacien uniquement : suspendu par l'administrateur, il ne déclare plus de stock. */
  suspendu?: boolean;
}
