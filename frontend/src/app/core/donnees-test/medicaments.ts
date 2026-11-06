/*
 * DONNÉES DE TEST INVENTÉES. Ce fichier charge medicaments-test.json, produit par
 * scripts/importer-medicaments.mjs à partir de data/medicaments_test.csv. Ce n'est ni la liste
 * officielle des médicaments, ni une information médicale. La source réelle reste à décider.
 */
import { Medicament } from '../models';
import medicaments from './medicaments-test.json';

export const MEDICAMENTS_TEST: Medicament[] = medicaments;
