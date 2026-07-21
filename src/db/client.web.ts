import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

import { migrations, TARGET_DB_VERSION } from './migrations';
import { loadDbBytes, saveDbBytes } from './web-storage';
import type {
  AppDatabase,
  ExecOptions,
  RunResult,
  SqlParameter,
} from '@/types/app-database';

/**
 * Client WEB do banco — usa sql.js (SQLite compilado pra WebAssembly).
 *
 * Este arquivo só é carregado no web (Metro resolve `.web.ts` antes de `.ts`).
 * No nativo, vale o `client.ts` (expo-sqlite).
 *
 * Características:
 *  - WASM local em /sql-wasm.wasm (caminho sensível a EXPO_BASE_URL).
 *  - Persistência em IndexedDB — bytes do banco sobrevivem a reloads/offline.
 *  - Transações aninhadas via SAVEPOINT (nível 0 = BEGIN/COMMIT).
 *  - Fila de escrita sem deadlock: só transações de nível 0 entram na fila.
 *  - Fila recuperável: erros não matam a queue.
 *  - Persistência só após COMMIT (nunca em transação, nunca em ROLLBACK).
 *  - Prepared statements sempre liberados com `.free()` (evita leak de memória).
 */

// ── Singleton ──────────────────────────────────────────────────────────────

let dbInstance: AppDatabase | null = null;
let initPromise: Promise<AppDatabase> | null = null;

/**
 * Abre/inicializa o banco (sql.js + WASM + IndexedDB).
 *
 * Idempotente — chamadas concorrentes recebem a mesma promise.
 */
export async function getDatabase(): Promise<AppDatabase> {
  if (dbInstance) return dbInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const { adapter, state } = await createWebDatabase();
    await initializeSchema(adapter, state);
    dbInstance = adapter;
    return adapter;
  })();

  try {
    return await initPromise;
  } catch (error) {
    initPromise = null;
    throw new DatabaseInitError(
      'Não foi possível inicializar o banco de dados web.',
      error,
    );
  }
}

// ── Criação do adapter ─────────────────────────────────────────────────────

/** Estado interno do adapter (uma única instância). */
interface AdapterState {
  /** Conexão sql.js. */
  database: Database;
  /** Profundidade da transação atual (0 = nenhuma). */
  transactionDepth: number;
  /** Se houve alteração desde a última persistência. */
  dirty: boolean;
}

/**
 * Carrega o WASM (sensível a EXPO_BASE_URL pra subdiretórios do GitHub Pages),
 * restaura bytes do IndexedDB (se houver) e cria o adapter.
 *
 * Retorna o adapter e o state interno (pra persistência final).
 */
async function createWebDatabase(): Promise<{ adapter: AppDatabase; state: AdapterState }> {
  // Caminho do WASM — relativo à página atual, funciona em subpath sem config.
  // Em dev: página em / → "./sql-wasm.wasm" resolve pra "/sql-wasm.wasm".
  // Em prod: página em /meutreino/ → "./sql-wasm.wasm" resolve pra "/meutreino/sql-wasm.wasm".
  const wasmUrl = './sql-wasm.wasm';

  let SQL: SqlJsStatic;
  try {
    SQL = await initSqlJs({ locateFile: () => wasmUrl });
  } catch (error) {
    throw new DatabaseInitError(
      `Não foi possível carregar o SQLite WebAssembly em ${wasmUrl}.`,
      error,
    );
  }

  // Restaura bytes salvos, se houver (preserva dados entre sessões).
  let database: Database;
  try {
    const savedBytes = await loadDbBytes();
    database = savedBytes ? new SQL.Database(savedBytes) : new SQL.Database();
  } catch (error) {
    throw new DatabaseInitError(
      'Não foi possível acessar o armazenamento local do navegador.',
      error,
    );
  }

  const state: AdapterState = {
    database,
    transactionDepth: 0,
    dirty: false,
  };

  const adapter = buildAdapter(state);
  return { adapter, state };
}

/**
 * Constrói o objeto AppDatabase sobre o estado.
 */
function buildAdapter(state: AdapterState): AppDatabase {
  return {
    execAsync: (sql, opts) => execAsyncImpl(state, sql, opts),
    runAsync: (sql, params, ...rest) =>
      runAsyncImpl(state, sql, normalizeParams(params, rest)),
    getFirstAsync: (sql, params, ...rest) =>
      getFirstAsyncImpl(state, sql, normalizeParams(params, rest)),
    getAllAsync: (sql, params, ...rest) =>
      getAllAsyncImpl(state, sql, normalizeParams(params, rest)),
    withTransactionAsync: (callback) =>
      withTransactionAsyncImpl(state, callback),
  };
}

// ── Fila de escrita (somente nível 0) ──────────────────────────────────────

/**
 * Fila recuperável: erros num item não quebram os próximos.
 * Importante: só transações de nível 0 entram na fila (evita deadlock com
 * transações aninhadas que precisam rodar síncronas dentro do callback).
 */
let writeQueue: Promise<unknown> = Promise.resolve();

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const operation = writeQueue.catch(() => undefined).then(task);
  // Mantém a fila sempre resolvida pra próximos itens.
  writeQueue = operation.catch(() => undefined);
  return operation;
}

// ── Fila de persistência (também recuperável) ──────────────────────────────

let persistQueue: Promise<void> = Promise.resolve();

function queuePersistence(task: () => Promise<void>): Promise<void> {
  const operation = persistQueue.catch(() => undefined).then(task);
  persistQueue = operation.catch(() => undefined);
  return operation;
}

/**
 * Exporta os bytes do banco pro IndexedDB.
 * Só deve ser chamado fora de transação ou após COMMIT.
 */
function persistDatabase(state: AdapterState): Promise<void> {
  return queuePersistence(async () => {
    const bytes = state.database.export();
    await saveDbBytes(bytes);
  });
}

/**
 * Marca o banco como alterado. Se não estamos em transação, persiste agora.
 * Em transação, só persiste no COMMIT.
 */
function markDirty(state: AdapterState): Promise<void> {
  state.dirty = true;
  if (state.transactionDepth === 0) {
    return persistDatabase(state).then(() => {
      state.dirty = false;
    });
  }
  return Promise.resolve();
}

// ── Implementações dos métodos ─────────────────────────────────────────────

async function execAsyncImpl(
  state: AdapterState,
  sql: string,
  opts?: ExecOptions,
): Promise<void> {
  state.database.run(sql);
  // persist default true; PRAGMAs e leituras passam { persist: false }.
  if (opts?.persist !== false) {
    await markDirty(state);
  }
}

async function runAsyncImpl(
  state: AdapterState,
  sql: string,
  params: SqlParameter[],
): Promise<RunResult> {
  const stmt = state.database.prepare(sql);
  let changes = 0;
  try {
    stmt.bind(paramsToSqlJs(params));
    stmt.step();
    changes = state.database.getRowsModified();
  } finally {
    stmt.free();
  }

  // lastInsertRowId via SELECT — lê de forma confiável após o INSERT/UPDATE.
  const idStmt = state.database.prepare('SELECT last_insert_rowid() AS id;');
  let lastInsertRowId = 0;
  try {
    if (idStmt.step()) {
      lastInsertRowId = Number(idStmt.getAsObject().id);
    }
  } finally {
    idStmt.free();
  }

  await markDirty(state);
  return { lastInsertRowId, changes };
}

async function getFirstAsyncImpl<T>(
  state: AdapterState,
  sql: string,
  params: SqlParameter[],
): Promise<T | null> {
  const stmt = state.database.prepare(sql);
  try {
    stmt.bind(paramsToSqlJs(params));
    if (stmt.step()) {
      return rowAsObject<T>(stmt);
    }
    return null;
  } finally {
    stmt.free();
  }
}

async function getAllAsyncImpl<T>(
  state: AdapterState,
  sql: string,
  params: SqlParameter[],
): Promise<T[]> {
  const stmt = state.database.prepare(sql);
  try {
    stmt.bind(paramsToSqlJs(params));
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(rowAsObject<T>(stmt));
    }
    return rows;
  } finally {
    stmt.free();
  }
}

// ── Transações (com SAVEPOINT) ─────────────────────────────────────────────

/**
 * Transação atômica. Nível 0: BEGIN/COMMIT/ROLLBACK na fila de escrita.
 * Aninhada (nível > 0): SAVEPOINT/RELEASE/ROLLBACK TO — roda DIRETO
 * (sem entrar na fila), evitando deadlock com a transação externa que já
 * detém a fila.
 */
function withTransactionAsyncImpl<T>(
  state: AdapterState,
  callback: () => Promise<T>,
): Promise<T> {
  if (state.transactionDepth > 0) {
    return runNestedTransaction(state, callback);
  }
  return enqueueWrite(() => runRootTransaction(state, callback));
}

async function runRootTransaction<T>(
  state: AdapterState,
  callback: () => Promise<T>,
): Promise<T> {
  state.database.run('BEGIN IMMEDIATE;');
  state.transactionDepth = 1;

  try {
    const result = await callback();
    state.database.run('COMMIT');
    state.transactionDepth = 0;

    // Persiste somente após COMMIT bem-sucedido.
    if (state.dirty) {
      await persistDatabase(state);
      state.dirty = false;
    }
    return result;
  } catch (error) {
    state.database.run('ROLLBACK');
    state.transactionDepth = 0;
    // Descarta alterações que nunca deveriam ser persistidas.
    state.dirty = false;
    throw error;
  }
}

async function runNestedTransaction<T>(
  state: AdapterState,
  callback: () => Promise<T>,
): Promise<T> {
  const savepoint = `app_sp_${state.transactionDepth}`;
  state.database.run(`SAVEPOINT ${savepoint}`);
  state.transactionDepth += 1;

  try {
    const result = await callback();
    state.transactionDepth -= 1;
    state.database.run(`RELEASE SAVEPOINT ${savepoint}`);
    return result;
  } catch (error) {
    state.transactionDepth -= 1;
    state.database.run(`ROLLBACK TO SAVEPOINT ${savepoint}`);
    state.database.run(`RELEASE SAVEPOINT ${savepoint}`);
    throw error;
  }
}

// ── Inicialização do schema ────────────────────────────────────────────────

/**
 * Aplica PRAGMA foreign_keys + migrations pendentes.
 * Reutiliza o mesmo `migrations.ts` do client nativo.
 *
 * Recebe o adapter E o state (pra persistir o estado final).
 */
async function initializeSchema(
  db: AppDatabase,
  state: AdapterState,
): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;', { persist: false });

  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  const currentVersion = row?.user_version ?? 0;
  const pending = migrations.filter((m) => m.version > currentVersion);

  for (const migration of pending) {
    try {
      await db.withTransactionAsync(async () => {
        await db.execAsync(migration.up);
        await db.execAsync(`PRAGMA user_version = ${migration.version};`, {
          persist: false,
        });
      });
    } catch (error) {
      throw new DatabaseInitError(
        `Falha ao aplicar a migration v${migration.version} (${migration.description}).`,
        error,
      );
    }
  }

  await db.execAsync(`PRAGMA user_version = ${TARGET_DB_VERSION};`, {
    persist: false,
  });

  // Persiste o estado final após inicialização (banco novo ou migrado).
  await persistDatabase(state);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Normaliza parâmetros: array OU rest args → array.
 * Compatível com código existente (passa array) e com assinatura rest.
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
 * Converte SqlParameter[] para o formato esperado pelo sql.js (BindParams).
 * Uint8Array é aceito nativamente; null/string/number também.
 */
function paramsToSqlJs(params: SqlParameter[]): Array<string | number | null | Uint8Array> {
  return params;
}

/**
 * Lê a linha atual do statement como objeto nomeado (pelos nomes das colunas).
 * Equivalente ao comportamento do expo-sqlite.
 */
function rowAsObject<T>(stmt: { getAsObject: () => Record<string, unknown> }): T {
  return stmt.getAsObject() as T;
}

// ── Erro ───────────────────────────────────────────────────────────────────

export class DatabaseInitError extends Error {
  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'DatabaseInitError';
    this.cause = cause;
  }
}
