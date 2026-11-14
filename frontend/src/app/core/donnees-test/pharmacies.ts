/*
 * DONNÉES DE TEST INVENTÉES : 22 pharmacies fictives (« Pharmacie Test NN », numéros +216000000NN,
 * positions plausibles près des villes indiquées). Aucune donnée réelle : le jeu d'origine (pharmacies et
 * téléphones réels) a été retiré de tout l'historique Git le 14 novembre 2026.
 */
import { Pharmacie } from '../models';
import pharmacies from './pharmacies-test.json';

/** Positions simulées du CSV tombées dans l'eau (goulet de Bizerte, lac de Tunis). */
const SUR_TERRE: Record<string, [number, number]> = {
  T032: [37.2714, 9.8655],
  T033: [37.2689, 9.8645],
  T035: [37.2733, 9.8635],
  T036: [37.2714, 9.8625],
  T039: [37.2703, 9.861],
  T129: [36.8122, 10.1775],
  T137: [36.8127, 10.1765],
  T145: [36.8121, 10.1785],
};

export const PHARMACIES_TEST: Pharmacie[] = (pharmacies as Pharmacie[]).map((pharmacie) => {
  const [latitude, longitude] = SUR_TERRE[pharmacie.id] ?? [pharmacie.latitude, pharmacie.longitude];
  return { ...pharmacie, latitude, longitude };
});
