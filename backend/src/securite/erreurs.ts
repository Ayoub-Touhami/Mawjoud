import { HttpException } from '@nestjs/common';

/**
 * Codes d'erreur renvoyés au front-end, qui les traduit (aucun texte affiché ne vient de l'API).
 * Mêmes mots à tirets que le front-end (core/services/auth.service.ts).
 */
export type CodeErreur =
  | 'donnees-invalides'
  | 'json-invalide'
  | 'type-contenu'
  | 'identifiants'
  | 'non-connecte'
  | 'acces-refuse'
  | 'email-non-verifie'
  | 'compte-suspendu'
  | 'csrf'
  | 'origine-refusee'
  | 'trop-de-tentatives'
  | 'mot-de-passe-faible'
  | 'mot-de-passe-actuel'
  | 'lien-invalide'
  | 'lien-expire'
  | 'demande-en-cours'
  | 'deja-rattache'
  | 'introuvable'
  | 'deja-decidee'
  | 'pharmacie-a-creer'
  | 'pharmacie-attribuee'
  | 'lot-invalide'
  | 'position-proche'
  | 'statut-incompatible'
  | 'transition-interdite'
  | 'conditions-non-remplies'
  | 'meme-statut'
  | 'deja-relu'
  | 'doublon'
  | 'trop-d-alertes'
  | 'erreur-interne';

export class ErreurApi extends HttpException {
  constructor(statut: number, code: CodeErreur, complement: Record<string, unknown> = {}) {
    super({ erreur: code, ...complement }, statut);
  }
}
