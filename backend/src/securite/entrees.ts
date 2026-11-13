import type { NextFunction, Request, Response } from 'express';

/** Profondeur d'imbrication maximale d'un corps JSON ou d'une requête (les DTO de l'API en ont 3 au plus). */
export const PROFONDEUR_MAX = 32;

/**
 * Vrai si la valeur est sûre : aucune chaîne (valeur ou clé) ne contient le caractère nul, que PostgreSQL
 * refuse (code 22021, qui donnait une erreur 500), et l'imbrication ne dépasse pas PROFONDEUR_MAX (au-delà,
 * la validation part en récursion profonde : RangeError, erreur 500). Parcours itératif, sans récursion.
 */
export function entreeSure(valeur: unknown): boolean {
  const pile: [unknown, number][] = [[valeur, 0]];
  while (pile.length) {
    const [v, profondeur] = pile.pop()!;
    if (typeof v === 'string') {
      if (v.includes('\u0000')) return false;
    } else if (v !== null && typeof v === 'object') {
      if (profondeur >= PROFONDEUR_MAX) return false;
      for (const [cle, enfant] of Object.entries(v)) {
        if (cle.includes('\u0000')) return false;
        pile.push([enfant, profondeur + 1]);
      }
    }
  }
  return true;
}

/** Middleware placé juste après la lecture du JSON : 400 donnees-invalides, sans recopier l'entrée. */
export function refuserEntreesDangereuses(req: Request, res: Response, suite: NextFunction): void {
  if (!entreeSure(req.body) || !entreeSure(req.query) || req.originalUrl.toLowerCase().includes('%00')) {
    res.status(400).json({ erreur: 'donnees-invalides' });
    return;
  }
  suite();
}
