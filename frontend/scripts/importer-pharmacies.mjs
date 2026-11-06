// Convertit un fichier CSV d'annuaire vers le format du modèle Pharmacie.
//
//   node scripts/importer-pharmacies.mjs <entree.csv> <sortie.json>
//
// Colonnes attendues : id, nom, adresse, ville, code_postal, gouvernorat, telephone, latitude,
// longitude, statut_inscription, donnee_test, source. Une ligne est écartée, et comptée dans le
// rapport, s'il lui manque un nom ou un identifiant, si son identifiant existe déjà, ou si ses
// coordonnées sont absentes ou hors de la Tunisie.
import { readFileSync, writeFileSync } from 'node:fs';
import { lireCsv } from './lire-csv.mjs';

const RECTANGLE = { ouest: 7.4, sud: 30.2, est: 11.7, nord: 37.6 };
const OBLIGATOIRES = ['id', 'nom', 'adresse', 'ville', 'latitude', 'longitude'];

function raisonDeRejet(ligne, vus) {
  if (!ligne.id?.trim()) return 'identifiant manquant';
  if (vus.has(ligne.id)) return 'identifiant en double';
  if (!ligne.nom?.trim()) return 'nom manquant';
  const latitude = Number.parseFloat(ligne.latitude);
  const longitude = Number.parseFloat(ligne.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return 'coordonnées manquantes';
  const dedans =
    latitude >= RECTANGLE.sud &&
    latitude <= RECTANGLE.nord &&
    longitude >= RECTANGLE.ouest &&
    longitude <= RECTANGLE.est;
  return dedans ? null : 'coordonnées hors de la Tunisie';
}

function versPharmacie(ligne) {
  const codePostal = ligne.code_postal?.trim();
  return {
    id: ligne.id.trim(),
    nom: ligne.nom.trim(),
    adresse: ligne.adresse.trim(),
    ville: ligne.ville.trim(),
    ...(codePostal ? { codePostal } : {}),
    gouvernorat: ligne.gouvernorat?.trim() ?? '',
    telephone: ligne.telephone?.trim() ?? '',
    horaires: [],
    latitude: Number.parseFloat(ligne.latitude),
    longitude: Number.parseFloat(ligne.longitude),
    etat: ligne.statut_inscription?.trim() === 'inscrite' ? 'inscrite' : 'non-inscrite',
    source: ligne.source?.trim() ?? '',
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
  const pharmacies = [];
  const rejets = new Map();
  for (const ligne of lignes) {
    const raison = raisonDeRejet(ligne, vus);
    if (raison) {
      rejets.set(raison, (rejets.get(raison) ?? 0) + 1);
    } else {
      vus.add(ligne.id);
      pharmacies.push(versPharmacie(ligne));
    }
  }
  writeFileSync(sortie, `${JSON.stringify(pharmacies, null, 1)}\n`);
  console.log(`${pharmacies.length} pharmacies écrites dans ${sortie}`);
  console.log(`${lignes.length - pharmacies.length} lignes écartées`);
  for (const [raison, nombre] of rejets) console.log(`  ${raison} : ${nombre}`);
}

const [entree, sortie] = process.argv.slice(2);
if (!entree || !sortie) {
  console.error('Usage : node scripts/importer-pharmacies.mjs <entree.csv> <sortie.json>');
  process.exit(1);
}
importer(entree, sortie);
