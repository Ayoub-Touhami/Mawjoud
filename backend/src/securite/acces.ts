import { applyDecorators, createParamDecorator, ExecutionContext, SetMetadata, UseGuards } from '@nestjs/common';
import { AdministrateurGuard, ConnecteGuard, PatientGuard, PharmacienGuard } from './gardes.js';
import { CLE_ACCES, CLE_EMAIL_VERIFIE, CLE_SUSPENDU_AUTORISE, type RequeteMawjoud } from './acces-cles.js';
import type { CompteConnecte, SessionOuverte } from './sessions.service.js';

export { CLE_ACCES, CLE_EMAIL_VERIFIE, CLE_SUSPENDU_AUTORISE, type Acces, type RequeteMawjoud } from './acces-cles.js';

/**
 * Chaque route déclare qui peut l'appeler. Sans déclaration, la route est refusée (SecuriteGuard).
 */
export interface OptionsAcces {
  /** Exige une adresse e-mail vérifiée (par défaut : non). */
  emailVerifie?: boolean;
  /**
   * Laisse passer un compte suspendu (par défaut : non). Réservé aux routes qui ne font que lire
   * l'état du compte. Les gardes de rôle refusent un compte suspendu partout ailleurs.
   */
  suspenduAutorise?: boolean;
}

const options = (o: OptionsAcces) => [
  SetMetadata(CLE_EMAIL_VERIFIE, !!o.emailVerifie),
  SetMetadata(CLE_SUSPENDU_AUTORISE, !!o.suspenduAutorise),
];

/** Ouvert à tous, sans compte (inscription, connexion, liens reçus par e-mail). */
export const Public = () => SetMetadata(CLE_ACCES, 'public');

/**
 * Tout compte connecté, quel que soit son rôle, même suspendu : sert à voir son état (/moi),
 * se déconnecter, changer son mot de passe. Aucune action sur l'annuaire ne doit utiliser cet accès.
 */
export const Connecte = (o: Omit<OptionsAcces, 'suspenduAutorise'> = {}) =>
  applyDecorators(SetMetadata(CLE_ACCES, 'connecte'), ...options({ ...o, suspenduAutorise: true }), UseGuards(ConnecteGuard));

export const Patient = (o: OptionsAcces = {}) =>
  applyDecorators(SetMetadata(CLE_ACCES, 'patient'), ...options(o), UseGuards(PatientGuard));

export const Pharmacien = (o: OptionsAcces = {}) =>
  applyDecorators(SetMetadata(CLE_ACCES, 'pharmacien'), ...options(o), UseGuards(PharmacienGuard));

/** Administrateur : e-mail vérifié et compte non suspendu, toujours. */
export const Administrateur = () =>
  applyDecorators(SetMetadata(CLE_ACCES, 'administrateur'), ...options({ emailVerifie: true }), UseGuards(AdministrateurGuard));

/** Compte connecté dans un contrôleur (garanti par le garde de la route). */
export const CompteCourant = createParamDecorator((_: unknown, ctx: ExecutionContext): CompteConnecte => {
  const req = ctx.switchToHttp().getRequest<RequeteMawjoud>();
  return req.session!.compte;
});

export const SessionCourante = createParamDecorator((_: unknown, ctx: ExecutionContext): SessionOuverte | undefined => {
  return ctx.switchToHttp().getRequest<RequeteMawjoud>().session;
});
