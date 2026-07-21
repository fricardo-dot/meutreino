import * as SQLite from 'expo-sqlite';

import { migrations, TARGET_DB_VERSION } from './migrations';
import type { AppDatabase, ExecOptions, RunResult, SqlParameter } from '@/types/app-database';

/**
 * Nome do arquivo do banco.
 *
 * O SQLite do Expo salva o arquivo no diretório de documentos do app, que é
 * persistido entre reinicializações. Fechar e reabrir o app NÃO apaga os dados.
 */
const DB_NAME = 'meutreino.db';

let dbInstance: AppDatabase | null = null;
let initPromise: Promise<AppDatabase> | null = null;

/**
 * Wrapper que adapta a conexão do expo-sqlite à interface `AppDatabase`.
 *
 * O expo-sqlite não aceita `{ persist }` em `execAsync` (opção exclusiva do
 * client web). Este wrapper simplesmente ignora a opção — no nativo, todas as
 * escritas já são persistidas automaticamente pelo sistema de arquivos.
 */
function wrapNative(db: SQLite.SQLiteDatabase): AppDatabase {
  return {
    execAsync(sql: string, _opts?: ExecOptions): Promise<void> {
      return db.execAsync(sql);
    },
    runAsync(
      sql: string,
      params?: SqlParameter[] | SqlParameter,
      ...rest: SqlParameter[]
    ): Promise<RunResult> {
      const all = normalizeParams(params, rest);
      return db.runAsync(sql, all).then((r) => ({
        lastInsertRowId: Number(r.lastInsertRowId),
        changes: r.changes,
      }));
    },
    getFirstAsync<T>(
      sql: string,
      params?: SqlParameter[] | SqlParameter,
      ...rest: SqlParameter[]
    ): Promise<T | null> {
      const all = normalizeParams(params, rest);
      return db.getFirstAsync<T>(sql, all).then((r) => (r === undefined ? null : r));
    },
    getAllAsync<T>(
      sql: string,
      params?: SqlParameter[] | SqlParameter,
      ...rest: SqlParameter[]
    ): Promise<T[]> {
      const all = normalizeParams(params, rest);
      return db.getAllAsync<T>(sql, all);
    },
    withTransactionAsync<T>(callback: () => Promise<T>): Promise<T> {
      // expo-sqlite aceita callback que retorna void ou T.
      // Como nosso tipo é Promise<T>, fazemos o cast.
      return db.withTransactionAsync(callback as () => Promise<void>) as unknown as Promise<T>;
    },
  };
}

/**
 * Normaliza os parâmetros: aceita array OU rest args, devolve sempre array.
 * Compatível com o código existente (que passa array) e com a assinatura rest.
 */
function normalizeParams(
  params: SqlParameter[] | SqlParameter | undefined,
  rest: SqlParameter[],
): SqlParameter[] {
  if (rest.length > 0) {
    if (params !== undefined) return [params as SqlParameter, ...rest];
    return [...rest];
  }
  if (Array.isArray(params)) return params;
  if (params === undefined) return [];
  return [params];
}

/**
 * Abre a conexão com o banco e aplica migrations pendentes.
 *
 * Garante que seja executada apenas uma vez por processo — chamadas
 * subsequentes retornam a mesma promise (e o mesmo db).
 *
 * Lança um erro descritivo se algo falhar, para que a UI mostre uma mensagem
 * útil em vez de uma tela em branco.
 */
export async function getDatabase(): Promise<AppDatabase> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const raw = await SQLite.openDatabaseAsync(DB_NAME);
    const db = wrapNative(raw);

    // Ativa FKs — importante para as 7 tabelas com relações.
    await db.execAsync('PRAGMA foreign_keys = ON;', { persist: false });

    await runMigrations(db);

    dbInstance = db;
    return db;
  })();

  try {
    return await initPromise;
  } catch (error) {
    // Descarta a promise falhada para permitir nova tentativa.
    initPromise = null;
    throw new DatabaseInitError(
      'Não foi possível inicializar o banco de dados local.',
      error,
    );
  }
}

/**
 * Aplica todas as migrations pendentes, em ordem, cada uma em sua transação.
 *
 * O controle de versão é feito com `PRAGMA user_version`, padrão do SQLite.
 */
async function runMigrations(db: AppDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  const currentVersion = row?.user_version ?? 0;

  const pending = migrations.filter((m) => m.version > currentVersion);

  for (const migration of pending) {
    await runSingleMigration(db, migration);
  }

  // Sinaliza que o banco está na versão alvo.
  await db.execAsync(`PRAGMA user_version = ${TARGET_DB_VERSION};`, { persist: false });
}

/**
 * Executa UMA migration dentro de uma transação explícita.
 *
 * Em caso de erro, a transação é revertida e o erro é relançado com contexto,
 * preservando o stack original. O banco permanece na versão anterior.
 *
 * Observação: o callback de `withTransactionAsync` recebe a própria conexão
 * (`db`), não um objeto de transação separado — então usamos `db.execAsync`.
 */
async function runSingleMigration(
  db: AppDatabase,
  migration: { version: number; description: string; up: string },
): Promise<void> {
  try {
    await db.withTransactionAsync(async () => {
      await db.execAsync(migration.up);
      await db.execAsync(`PRAGMA user_version = ${migration.version};`, { persist: false });
    });
  } catch (error) {
    throw new DatabaseInitError(
      `Falha ao aplicar a migration v${migration.version} (${migration.description}).`,
      error,
    );
  }
}

/**
 * Erro de inicialização do banco.
 *
 * Guarda a causa original em `cause` para facilitar o diagnóstico.
 */
export class DatabaseInitError extends Error {
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'DatabaseInitError';
    this.cause = cause;
  }
}
