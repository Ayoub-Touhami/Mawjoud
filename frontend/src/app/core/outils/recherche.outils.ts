import { Medicament } from '../models';

export const LONGUEUR_MINIMALE = 2;

/** Ignore les accents, les signes arabes et la casse : « levothyroxine » = « Lévothyroxine ». */
export function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/œ/g, 'oe')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function contientArabe(texte: string): boolean {
  return /\p{Script=Arabic}/u.test(texte);
}

/** Nom complet, sans répéter le dosage quand le nom le contient déjà. */
export function libelleMedicament({ nom, dosage }: Medicament): string {
  return nom.includes(dosage) ? nom : `${nom} ${dosage}`;
}

/** Nombre d'insertions, suppressions, remplacements et inversions de lettres voisines. */
function distanceEdition(a: string, b: string): number {
  const lignes = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j++) {
    lignes[0][j] = j;
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      lignes[i][j] = Math.min(
        lignes[i - 1][j] + 1,
        lignes[i][j - 1] + 1,
        lignes[i - 1][j - 1] + cout,
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        lignes[i][j] = Math.min(lignes[i][j], lignes[i - 2][j - 2] + 1);
      }
    }
  }
  return lignes[a.length][b.length];
}

/** Une faute à partir de 4 lettres, deux à partir de 8 ; jamais dans un nombre. */
function fautesAdmises(mot: string, large: boolean): number {
  if (/\d/.test(mot) || mot.length < 4) {
    return 0;
  }
  return (mot.length < 8 ? 1 : 2) + (large ? 1 : 0);
}

/** Plus le score est bas, meilleure est la correspondance. */
function scoreDuMot(mot: string, champ: string, large: boolean): number | null {
  if (champ.startsWith(mot)) {
    return 0;
  }
  const mots = champ.split(/[\s/,-]+/);
  if (mots.some((m) => m.startsWith(mot))) {
    return 1;
  }
  if (champ.includes(mot)) {
    return 2;
  }
  const admises = fautesAdmises(mot, large);
  if (!admises) {
    return null;
  }
  const ecart = Math.min(
    ...mots.flatMap((m) => [distanceEdition(mot, m), distanceEdition(mot, m.slice(0, mot.length))]),
  );
  return ecart <= admises ? 2 + ecart : null;
}

function scoreMedicament(medicament: Medicament, mots: string[], large: boolean): number | null {
  const principaux = [medicament.nom, medicament.nomArabe]
    .filter((v): v is string => !!v)
    .map(normaliser);
  // La forme et le dosage ne servent qu'à préciser : seul, « do » ne doit pas trouver « doseur ».
  const precisions = mots.length > 1 ? [medicament.forme, medicament.dosage] : [];
  const secondaires = [medicament.dci, medicament.dciArabe, ...precisions]
    .filter((v): v is string => !!v)
    .map(normaliser);
  let total = 0;
  for (const mot of mots) {
    const scores = [
      ...principaux.map((champ) => scoreDuMot(mot, champ, large)),
      ...secondaires.map((champ) => {
        const score = scoreDuMot(mot, champ, large);
        return score === null ? null : score + 0.5;
      }),
    ].filter((score): score is number => score !== null);
    if (!scores.length) {
      return null;
    }
    total += Math.min(...scores);
  }
  return total;
}

/** Par nom commercial ou par substance (DCI), mot par mot : « doliprane 500 » convient. */
export function chercherDans(
  medicaments: Medicament[],
  texte: string,
  large = false,
): Medicament[] {
  const mots = normaliser(texte).split(' ').filter(Boolean);
  if (normaliser(texte).length < LONGUEUR_MINIMALE) {
    return [];
  }
  return medicaments
    .map((medicament) => ({ medicament, score: scoreMedicament(medicament, mots, large) }))
    .filter((r): r is { medicament: Medicament; score: number } => r.score !== null)
    .sort(
      (a, b) =>
        a.score - b.score ||
        libelleMedicament(a.medicament).localeCompare(libelleMedicament(b.medicament), undefined, {
          numeric: true,
        }),
    )
    .map((r) => r.medicament);
}
