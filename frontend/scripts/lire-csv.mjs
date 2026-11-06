/** Lit un CSV avec guillemets, virgules et retours à la ligne dans les champs. */
export function lireCsv(texte) {
  const lignes = [];
  let ligne = [];
  let champ = '';
  let entreGuillemets = false;
  const source = texte.replace(/^﻿/, '');
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (entreGuillemets) {
      if (c === '"' && source[i + 1] === '"') {
        champ += '"';
        i++;
      } else if (c === '"') {
        entreGuillemets = false;
      } else {
        champ += c;
      }
    } else if (c === '"') {
      entreGuillemets = true;
    } else if (c === ',') {
      ligne.push(champ);
      champ = '';
    } else if (c === '\n') {
      ligne.push(champ.replace(/\r$/, ''));
      lignes.push(ligne);
      ligne = [];
      champ = '';
    } else {
      champ += c;
    }
  }
  if (champ || ligne.length) {
    ligne.push(champ.replace(/\r$/, ''));
    lignes.push(ligne);
  }
  const [entetes, ...donnees] = lignes.filter((l) => l.some((v) => v.trim()));
  return donnees.map((l) => Object.fromEntries(entetes.map((nom, i) => [nom.trim(), l[i] ?? ''])));
}
