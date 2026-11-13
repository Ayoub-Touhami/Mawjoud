import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import pg from 'pg';
import { CONFIGURATION } from '../config/jetons-injection.js';
import type { Configuration } from '../config/configuration.js';

export type Valeur = string | number | boolean | Date | Buffer | null | readonly string[];

/** Exécuteur de requêtes : le pool, ou un client dans une transaction. */
export interface Executeur {
  requete<T extends pg.QueryResultRow = pg.QueryResultRow>(texte: string, valeurs?: Valeur[]): Promise<T[]>;
}

/**
 * Accès à PostgreSQL en SQL pur. Toutes les valeurs passent en paramètres ($1, $2…) :
 * aucun texte venant d'une requête HTTP n'est jamais concaténé dans du SQL.
 */
@Injectable()
export class BaseService implements Executeur, OnModuleInit, OnModuleDestroy {
  private readonly journal = new Logger('Base');
  private readonly pool: pg.Pool;

  constructor(@Inject(CONFIGURATION) config: Configuration) {
    this.pool = new pg.Pool({ connectionString: config.urlBase, max: 10, idleTimeoutMillis: 30_000 });
    // Seul le message est gardé : jamais la chaîne de connexion.
    this.pool.on('error', (e) => this.journal.error(`Connexion PostgreSQL perdue : ${e.message}`));
  }

  /** Refuse de démarrer avec un compte trop puissant. */
  async onModuleInit(): Promise<void> {
    const [r] = await this.requete<{ compte: string; superutilisateur: boolean; base: string }>(
      `SELECT current_user AS compte, rolsuper AS superutilisateur, current_database() AS base
         FROM pg_roles WHERE rolname = current_user`,
    );
    if (!r || r.superutilisateur || r.compte === 'postgres') {
      throw new Error('Le back-end refuse de démarrer avec un superutilisateur : utiliser mawjoud_api.');
    }
    this.journal.log(`Connecté à la base « ${r.base} » avec le compte ${r.compte}.`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async requete<T extends pg.QueryResultRow = pg.QueryResultRow>(texte: string, valeurs: Valeur[] = []): Promise<T[]> {
    const r = await this.pool.query<T>(texte, valeurs as unknown[]);
    return r.rows;
  }

  /**
   * Lecture publique : transaction en lecture seule, sous le rôle mawjoud_lecture_publique
   * (migration 029). La base garantit que seules les vues publique.* sont lues et que rien
   * n'est écrit, même si une requête du back-end était erronée.
   */
  async lecturePublique<R>(fn: (lecture: Executeur) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    const lecture: Executeur = {
      requete: async <T extends pg.QueryResultRow>(texte: string, valeurs: Valeur[] = []) =>
        (await client.query<T>(texte, valeurs as unknown[])).rows,
    };
    try {
      await client.query('BEGIN TRANSACTION READ ONLY');
      await client.query('SET LOCAL ROLE mawjoud_lecture_publique');
      const resultat = await fn(lecture);
      await client.query('COMMIT');
      return resultat;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }

  /** Exécute fn dans une transaction ; tout est annulé à la moindre erreur. */
  async transaction<R>(fn: (tx: Executeur) => Promise<R>): Promise<R> {
    const client = await this.pool.connect();
    const tx: Executeur = {
      requete: async <T extends pg.QueryResultRow>(texte: string, valeurs: Valeur[] = []) =>
        (await client.query<T>(texte, valeurs as unknown[])).rows,
    };
    try {
      await client.query('BEGIN');
      const resultat = await fn(tx);
      await client.query('COMMIT');
      return resultat;
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
}
