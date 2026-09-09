import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

import { migrations, TARGET_DB_VERSION } from './migrations';
import { loadSnapshot, saveSnapshot } from './web-storage';
import type {
  AppDatabase,
  DbTransaction,
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
 *  - Transações: BEGIN/COMMIT/ROLLBACK. Não há aninhamento — o callback
 *    recebe um `tx` que não sabe abrir outra transação.
 *  - Fila de escrita: transações E escritas pela conexão passam por ela, uma
 *    de cada vez. Só o `tx` executa direto, por já estar dentro da transação.
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
    const { adapter, state, tinhaSnapshot } = await createWebDatabase();
    await initializeSchema(adapter, state, tinhaSnapshot);
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
  /**
   * Contador de escrita de que esta aba partiu. Vai junto em cada
   * gravação para detectar que outra aba gravou no meio do caminho.
   */
  storageVersion: number;
}

/**
 * Carrega o WASM (sensível a EXPO_BASE_URL pra subdiretórios do GitHub Pages),
 * restaura bytes do IndexedDB (se houver) e cria o adapter.
 *
 * Retorna o adapter e o state interno (pra persistência final).
 */
async function createWebDatabase(): Promise<{
  adapter: AppDatabase;
  state: AdapterState;
  /** false = banco criado agora, do zero. */
  tinhaSnapshot: boolean;
}> {
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
  let storageVersion = 0;
  let jaTinhaBytes = false;
  try {
    const snapshot = await loadSnapshot();
    database = snapshot ? new SQL.Database(snapshot.bytes) : new SQL.Database();
    storageVersion = snapshot ? snapshot.version : 0;
    jaTinhaBytes = snapshot !== null;
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
    storageVersion,
  };

  const adapter = buildAdapter(state);
  return { adapter, state, tinhaSnapshot: jaTinhaBytes };
}

/**
 * Constrói o objeto AppDatabase sobre o estado.
 */
function buildAdapter(state: AdapterState): AppDatabase {
  return {
    // Escritas pela CONEXÃO entram na fila: se uma transação estiver aberta,
    // esperam ela terminar em vez de executar dentro dela.
    execAsync: (sql, opts) =>
      enqueueWrite(() => execDireto(state, sql, opts)),
    runAsync: (sql, params, ...rest) =>
      enqueueWrite(() => runDireto(state, sql, normalizeParams(params, rest))),
    // Leituras NÃO entram na fila, e isso tem um preço: uma leitura disparada
    // enquanto uma transação está aberta enxerga o estado não commitado dela.
    // Enfileirá-las não é opção — travaria as leituras feitas de dentro do
    // próprio callback (o import de backup faz PRAGMA table_info ali dentro).
    // O sql.js é uma conexão só, sem snapshot isolation para oferecer.
    getFirstAsync: (sql, params, ...rest) =>
      getFirstAsyncImpl(state, sql, normalizeParams(params, rest)),
    getAllAsync: (sql, params, ...rest) =>
      getAllAsyncImpl(state, sql, normalizeParams(params, rest)),
    withTransactionAsync: (callback) =>
      withTransactionAsyncImpl(state, callback),
  };
}

/**
 * Executor entregue ao callback da transação.
 *
 * Roda DIRETO na conexão, sem passar pela fila — a transação já a detém, e
 * enfileirar aqui seria deadlock imediato.
 */
function buildTransactionExecutor(state: AdapterState): DbTransaction {
  return {
    execAsync: (sql, opts) => execDireto(state, sql, opts),
    runAsync: (sql, params, ...rest) =>
      runDireto(state, sql, normalizeParams(params, rest)),
    getFirstAsync: (sql, params, ...rest) =>
      getFirstAsyncImpl(state, sql, normalizeParams(params, rest)),
    getAllAsync: (sql, params, ...rest) =>
      getAllAsyncImpl(state, sql, normalizeParams(params, rest)),
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
    state.storageVersion = await saveSnapshot(bytes, state.storageVersion);
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

async function execDireto(
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

async function runDireto(
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

  // Só marca sujo se a linha realmente mudou.
  //
  // Sem isto, um comando que não altera nada — `INSERT OR IGNORE` que ignora,
  // `UPDATE` sem correspondência — reexportava o banco inteiro para o
  // IndexedDB. Além do desperdício, isso avançava o contador de versão do
  // snapshot: como `ensureSeedData` roda um INSERT OR IGNORE por exercício em
  // TODA abertura, só abrir o app numa segunda aba invalidava a primeira, que
  // passava a receber StaleDatabaseError sem ninguém ter mudado dado nenhum.
  if (changes > 0) {
    await markDirty(state);
  }
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

// ── Transações ─────────────────────────────────────────────────────────────

/**
 * Transação atômica: BEGIN IMMEDIATE / COMMIT / ROLLBACK, sempre pela fila de
 * escrita.
 *
 * O callback recebe um executor ligado à transação, e é por ele que todo o SQL
 * do bloco roda. Nada de aninhamento: esse executor não expõe
 * `withTransactionAsync`, então o compilador impede o caso que antes virava
 * SAVEPOINT dentro da transação alheia.
 */
function withTransactionAsyncImpl<T>(
  state: AdapterState,
  callback: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  // SEMPRE na fila. Uma transação pedida enquanto outra roda espera a vez, em
  // vez de virar SAVEPOINT dentro da transação alheia — o que fazia a segunda
  // responder sucesso e depois desaparecer no ROLLBACK da primeira.
  return enqueueWrite(() => runRootTransaction(state, callback));
}

async function runRootTransaction<T>(
  state: AdapterState,
  callback: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  state.database.run('BEGIN IMMEDIATE;');
  state.transactionDepth = 1;

  let result: T;
  try {
    result = await callback(buildTransactionExecutor(state));
    state.database.run('COMMIT');
  } catch (error) {
    state.database.run('ROLLBACK');
    state.transactionDepth = 0;
    // Descarta alterações que nunca deveriam ser persistidas.
    state.dirty = false;
    throw error;
  }
  state.transactionDepth = 0;

  // Daqui pra frente o COMMIT já aconteceu: qualquer falha é de PERSISTÊNCIA,
  // não da transação. Por isso está FORA do try acima — cair no catch faria um
  // ROLLBACK sem transação aberta, e o "cannot rollback" do sql.js esconderia
  // o erro de verdade (que pode ser o StaleDatabaseError, cuja mensagem manda
  // recarregar a aba).
  //
  // `dirty` só é limpo se a gravação der certo: se falhou, o banco em memória
  // segue à frente do disco e a próxima gravação tenta de novo.
  if (state.dirty) {
    await persistDatabase(state);
    state.dirty = false;
  }
  return result;
}


// ── Inicialização do schema ────────────────────────────────────────────────

/**
 * Aplica PRAGMA foreign_keys + migrations pendentes.
 * Reutiliza o mesmo `migrations.ts` do client nativo.
 *
 * `tinhaSnapshot` diz se o banco veio do disco ou foi criado agora — é o que
 * decide se a inicialização precisa gravar.
 */
async function initializeSchema(
  db: AppDatabase,
  state: AdapterState,
  tinhaSnapshot: boolean,
): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;', { persist: false });

  const row = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version;',
  );
  const currentVersion = row?.user_version ?? 0;
  const pending = migrations.filter((m) => m.version > currentVersion);

  for (const migration of pending) {
    try {
      await db.withTransactionAsync(async (tx) => {
        await tx.execAsync(migration.up);
        await tx.execAsync(`PRAGMA user_version = ${migration.version};`, {
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

  // Grava SÓ se a inicialização mudou alguma coisa: banco criado agora, ou
  // migration aplicada.
  //
  // Gravar sempre era um problema real desde que o snapshot ganhou contador de
  // versão: abrir o app numa segunda aba regravava o MESMO banco, avançava o
  // contador, e a primeira aba passava a receber StaleDatabaseError na próxima
  // série registrada — sem que a segunda aba tivesse mudado nada.
  if (!tinhaSnapshot || pending.length > 0) {
    await persistDatabase(state);
  }
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
