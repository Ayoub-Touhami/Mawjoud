// Convertit un fichier CSV de médicaments vers le format du modèle Medicament.
//
//   node scripts/importer-medicaments.mjs <entree.csv> <sortie.json>
//
// Colonnes obligatoires : nom, dci, forme, dosage. Colonnes facultatives : id, categorie,
// nom_ar, dci_ar, donnee_test. Sans colonne id, un identifiant M001, M002… est attribué.
// Une ligne sans nom ou déjà présente (même nom, forme et dosage) est écartée et comptée.
import { readFileSync, writeFileSync } from 'node:fs';
import { lireCsv } from './lire-csv.mjs';

const OBLIGATOIRES = ['nom', 'dci', 'forme', 'dosage'];

function versMedicament(ligne, rang) {
  const facultatif = (colonne, cle) => {
    const valeur = ligne[colonne]?.trim();
    return valeur ? { [cle]: valeur } : {};
  };
  return {
    id: ligne.id?.trim() || `M${String(rang + 1).padStart(3, '0')}`,
    nom: ligne.nom.trim(),
    dci: ligne.dci.trim(),
    forme: ligne.forme.trim(),
    dosage: ligne.dosage.trim(),
    ...facultatif('categorie', 'categorie'),
    ...facultatif('nom_ar', 'nomArabe'),
    ...facultatif('dci_ar', 'dciArabe'),
    ...(ligne.donnee_test?.trim() === 'oui' ? { donneeTest: true } : {}),
  };
}

function importer(entree, sortie) {
  const lignes = lireCsv(readFileSync(entree, 'utf8'));
  const manquantes = OBLIGATOIRES.filter((nom) => !(nom in (lignes[0] ?? {})));
  if (manquantes.length) {
    throw new Error(`Colonnes absentes du fichier : ${manquantes.join(', ')}`);
  }
  const vus = new Set();
  const medicaments = [];
  let sansNom = 0;
  let doublons = 0;
  for (const ligne of lignes) {
    const cle = `${ligne.nom}|${ligne.forme}|${ligne.dosage}`.toLowerCase();
    if (!ligne.nom.trim()) {
      sansNom++;
    } else if (vus.has(cle)) {
      doublons++;
    } else {
      vus.add(cle);
      medicaments.push(versMedicament(ligne, medicaments.length));
    }
  }
  writeFileSync(sortie, `${JSON.stringify(medicaments, null, 1)}\n`);
  console.log(`${medicaments.length} médicaments écrits dans ${sortie}`);
  console.log(`${sansNom} lignes sans nom, ${doublons} doublons écartés`);
}

const [entree, sortie] = process.argv.slice(2);
if (!entree || !sortie) {
  console.error('Usage : node scripts/importer-medicaments.mjs <entree.csv> <sortie.json>');
  process.exit(1);
}
importer(entree, sortie);
