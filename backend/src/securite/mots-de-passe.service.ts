import { Injectable, OnModuleInit } from '@nestjs/common';
import argon2 from 'argon2';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Paramètres OWASP pour argon2id : 19 Mio, 2 passes, 1 fil. */
export const OPTIONS_ARGON2 = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const LONGUEUR_MIN = 10;
export const LONGUEUR_MAX = 128;

export type MotifRefus = 'trop-court' | 'trop-long' | 'trop-courant' | 'identique-email';

/** Normalisation Unicode (NFC) : une même phrase tapée sur deux claviers donne la même empreinte. */
function normaliser(motDePasse: string): string {
  return motDePasse.normalize('NFC');
}

/** Une valeur par ligne ; lignes vides et lignes « # » ignorées ; minuscules, Unicode NFC. */
function chargerListe(fichier: string): Set<string> {
  const lignes = readFileSync(resolve(process.cwd(), 'donnees', fichier), 'utf8').split(/\r?\n/);
  return new Set(
    lignes.map((l) => l.trim().normalize('NFC').toLowerCase()).filter((l) => l !== '' && !l.startsWith('#')),
  );
}

/** Chiffres, espaces, ponctuation et symboles ajoutés en fin de mot de passe (motdepasse2026, bismillah123!). */
const SUFFIXE_FACILE = /[\s\p{N}\p{P}\p{S}]+$/u;

/**
 * Politique et empreintes des mots de passe (décision du 13 novembre 2026, NIST 800-63B) :
 * 10 à 128 caractères ; refus des 10 000 mots de passe les plus courants (SecLists), d'une liste
 * française et arabe translittérée (racine seule ou suivie de chiffres et de ponctuation) et de
 * l'adresse e-mail ; aucune règle de composition. Le mot de passe n'est jamais journalisé ni renvoyé.
 */
@Injectable()
export class MotsDePasseService implements OnModuleInit {
  /** SecLists : refus à l'identique. */
  private courants = new Set<string>();
  /** Liste Mawjoud (français, arabe translittéré, Tunisie) : refus de la racine, même suivie de chiffres. */
  private racines = new Set<string>();
  /** Empreinte d'un mot de passe jetable : vérifiée quand le compte n'existe pas (même durée de réponse). */
  private empreinteFactice = '';

  async onModuleInit(): Promise<void> {
    this.courants = chargerListe('mots-de-passe-courants.txt');
    this.racines = chargerListe('mots-de-passe-courants-fr-ar.txt');
    this.empreinteFactice = await argon2.hash(`factice-${Date.now()}-${Math.random()}`, OPTIONS_ARGON2);
  }

  verifierPolitique(motDePasse: string, email: string): MotifRefus | null {
    const mdp = normaliser(motDePasse);
    const longueur = [...mdp].length; // en caractères, pas en unités UTF-16 (arabe, émojis)
    if (longueur < LONGUEUR_MIN) return 'trop-court';
    if (longueur > LONGUEUR_MAX) return 'trop-long';
    const minuscule = mdp.toLowerCase();
    if (this.courants.has(minuscule) || this.racines.has(minuscule)) return 'trop-courant';
    const racine = minuscule.replace(SUFFIXE_FACILE, '');
    if (racine !== minuscule && this.racines.has(racine)) return 'trop-courant';
    const adresse = email.trim().toLowerCase();
    const local = adresse.split('@')[0] ?? '';
    if (minuscule === adresse || (local.length > 0 && minuscule === local)) return 'identique-email';
    return null;
  }

  hacher(motDePasse: string): Promise<string> {
    return argon2.hash(normaliser(motDePasse), OPTIONS_ARGON2);
  }

  /** Faux en cas d'empreinte illisible : jamais d'exception qui contiendrait une valeur. */
  async verifier(empreinte: string, motDePasse: string): Promise<boolean> {
    try {
      return await argon2.verify(empreinte, normaliser(motDePasse));
    } catch {
      return false;
    }
  }

  /** Pour un compte inexistant : même calcul qu'une vraie vérification, résultat toujours faux. */
  async verifierFactice(motDePasse: string): Promise<false> {
    await this.verifier(this.empreinteFactice, motDePasse);
    return false;
  }

  doitRecalculer(empreinte: string): boolean {
    try {
      return argon2.needsRehash(empreinte, OPTIONS_ARGON2);
    } catch {
      return false;
    }
  }
}
