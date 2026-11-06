/** Signalement d'abus. Sa source reste à décider : seules des données de test existent. */
export interface Signalement {
  id: string;
  compteId: string;
  pharmacieId: string;
  texte: string;
  creeLe: string;
  donneeTest?: boolean;
}
