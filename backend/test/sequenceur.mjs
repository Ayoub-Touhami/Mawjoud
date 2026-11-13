import Sequencer from '@jest/test-sequencer';

/**
 * Ordre des fichiers de tests (Partie 9d : tests indépendants).
 * ORDRE_TESTS non défini : ordre alphabétique (toujours le même).
 * ORDRE_TESTS=inverse : ordre alphabétique inversé.
 * ORDRE_TESTS=aleatoire[:graine] : ordre mélangé ; la graine est affichée pour rejouer le même ordre.
 */
function melanger(liste, graine) {
  // mulberry32 : petit générateur reproductible, bien mélangé même pour de petites graines.
  let etat = graine >>> 0;
  const hasard = () => {
    etat = (etat + 0x6d2b79f5) >>> 0;
    let x = Math.imul(etat ^ (etat >>> 15), 1 | etat);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
  };
  const r = [...liste];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(hasard() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

export default class SequenceurMawjoud extends (Sequencer.default ?? Sequencer) {
  sort(tests) {
    const tries = [...tests].sort((a, b) => a.path.localeCompare(b.path));
    const ordre = process.env.ORDRE_TESTS ?? '';
    let resultat = tries;
    if (ordre === 'inverse') resultat = tries.reverse();
    else if (ordre.startsWith('aleatoire')) {
      const graine = Number(ordre.split(':')[1]) || Date.now() % 1_000_000;
      resultat = melanger(tries, graine);
      process.stdout.write(`Ordre aléatoire, graine ${graine} (ORDRE_TESTS=aleatoire:${graine} pour le rejouer).\n`);
    }
    if (ordre) process.stdout.write(`Ordre des fichiers : ${resultat.map((t) => t.path.split(/[\\/]/).pop()).join(', ')}\n`);
    return resultat;
  }
}
