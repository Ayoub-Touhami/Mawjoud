/*
 * DONNÉES DE TEST INVENTÉES. Ces déclarations de stock sont fabriquées : elles ne disent rien
 * de la disponibilité réelle d'un médicament. Les dates partent de l'instant du chargement
 * pour que certaines soient récentes et d'autres déjà « à confirmer ».
 */
import { StatutDeclare, Stock } from '../models';
import { MEDICAMENTS_TEST } from './medicaments';
import { PHARMACIES_TEST } from './pharmacies';

const STATUTS: StatutDeclare[] = ['disponible', 'quantite-limitee', 'en-rupture'];
const HEURES_ECOULEES = [1, 2, 3, 5, 8, 12, 20, 26, 40, 72];
const MEDICAMENTS_PAR_PHARMACIE = 12;
const HEURE_MS = 60 * 60 * 1000;

/** Répartition fixe, pour que les mêmes données reviennent à chaque chargement. */
export function fabriquerStocks(maintenant: Date = new Date()): Stock[] {
  return PHARMACIES_TEST.filter((pharmacie) => pharmacie.etat === 'inscrite').flatMap(
    (pharmacie, p) =>
      Array.from({ length: MEDICAMENTS_PAR_PHARMACIE }, (_, n) => {
        const medicament = MEDICAMENTS_TEST[(p * 7 + n * 3) % MEDICAMENTS_TEST.length];
        const heures = HEURES_ECOULEES[(p + n) % HEURES_ECOULEES.length];
        return {
          pharmacieId: pharmacie.id,
          medicamentId: medicament.id,
          statutDeclare: STATUTS[(p + n * 2) % STATUTS.length],
          declareLe: new Date(maintenant.getTime() - heures * HEURE_MS).toISOString(),
        };
      }),
  );
}
