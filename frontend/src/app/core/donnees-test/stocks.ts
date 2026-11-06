/*
 * DONNÉES DE TEST INVENTÉES. Ces déclarations de stock sont fabriquées : elles ne reflètent
 * aucune pharmacie réelle. Les dates partent de l'instant du chargement, de 10 minutes à
 * 3 jours, pour que certaines soient récentes et d'autres déjà « à confirmer ».
 */
import { StatutDeclare, Stock } from '../models';
import { MEDICAMENTS_TEST } from './medicaments';
import { PHARMACIES_TEST } from './pharmacies';

const STATUTS: StatutDeclare[] = ['disponible', 'quantite-limitee', 'en-rupture'];
const MINUTES_ECOULEES = [10, 45, 120, 300, 720, 1200, 1560, 2400, 3600, 4320];
const MEDICAMENTS_PAR_PHARMACIE = 14;
const MINUTE_MS = 60 * 1000;

/** Imodium n'est déclaré nulle part : cas « aucune pharmacie n'a déclaré ce médicament ». */
export const MEDICAMENT_JAMAIS_DECLARE = 'M037';
/** Aspégic est déclaré en rupture partout. */
export const MEDICAMENT_EN_RUPTURE = 'M040';

/** Répartition fixe, pour que les mêmes données reviennent à chaque chargement. */
export function fabriquerStocks(maintenant: Date = new Date()): Stock[] {
  const courants = MEDICAMENTS_TEST.filter(
    (m) => m.id !== MEDICAMENT_JAMAIS_DECLARE && m.id !== MEDICAMENT_EN_RUPTURE,
  );
  const date = (minutes: number) => new Date(maintenant.getTime() - minutes * MINUTE_MS);
  return PHARMACIES_TEST.filter((pharmacie) => pharmacie.etat === 'inscrite').flatMap(
    (pharmacie, p) => {
      const stocks: Stock[] = Array.from({ length: MEDICAMENTS_PAR_PHARMACIE }, (_, n) => ({
        pharmacieId: pharmacie.id,
        medicamentId: courants[(p * 7 + n * 3) % courants.length].id,
        statutDeclare: STATUTS[(p + n * 2) % STATUTS.length],
        declareLe: date(MINUTES_ECOULEES[(p + n) % MINUTES_ECOULEES.length]).toISOString(),
      }));
      if (p % 3 === 0) {
        stocks.push({
          pharmacieId: pharmacie.id,
          medicamentId: MEDICAMENT_EN_RUPTURE,
          statutDeclare: 'en-rupture',
          declareLe: date(MINUTES_ECOULEES[p % 6]).toISOString(),
        });
      }
      return stocks;
    },
  );
}
