import * as SQLite from 'expo-sqlite';

import {
  migrations,
  recusarVersaoFutura,
  TARGET_DB_VERSION,
} from './migrations';
import type {
  AppDatabase,
  DbTransaction,
  ExecOptions,
  RunResult,
  SqlParameter,
} from '@/types/app-database';

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
 *
 * A fila de escrita e a transação EXCLUSIVA existem para dar aqui a mesma
 * semântica do client web. Sem elas, o mesmo código se comportava diferente
 * nas duas plataformas: no web uma escrita concorrente esperava a transação
 * terminar, e no nativo ela entrava na transação alheia e sumia no ROLLBACK —
 * exatamente o defeito que o contrato do `tx` foi criado para eliminar.
 */
function wrapNative(db: SQLite.SQLiteDatabase): AppDatabase {
  // Mesma fila do client web: escritas pela conexão executam uma de cada vez,
  // e uma transação segura a fila enquanto dura.
  let writeQueue: Promise<unknown> = Promise.resolve();
  function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    const operation = writeQueue.catch(() => undefined).then(task);
    writeQueue = operation.catch(() => undefined);
    return operation;
  }

  /**
   * Adapta uma conexão do expo-sqlite ao executor da interface.
   *
   * Serve tanto para a conexão principal quanto para o `txn` que o expo
   * entrega dentro de `withExclusiveTransactionAsync` — que, segundo a própria
   * documentação, é por onde TODO o SQL do bloco precisa passar.
   */
  function adaptar(conn: SQLite.SQLiteDatabase): DbTransaction {
    return {
      execAsync(sql: string, _opts?: ExecOptions): Promise<void> {
        return conn.execAsync(sql);
      },
      runAsync(
        sql: string,
        params?: SqlParameter[] | SqlParameter,
        ...rest: SqlParameter[]
      ): Promise<RunResult> {
        const all = normalizeParams(params, rest);
        return conn.runAsync(sql, all).then((r) => ({
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
        return conn.getFirstAsync<T>(sql, all).then((r) => (r === undefined ? null : r));
      },
      getAllAsync<T>(
        sql: string,
        params?: SqlParameter[] | SqlParameter,
        ...rest: SqlParameter[]
      ): Promise<T[]> {
        const all = normalizeParams(params, rest);
        return conn.getAllAsync<T>(sql, all);
      },
    };
  }

  const direto = adaptar(db);

  const conexao: AppDatabase = {
    // Escritas pela conexão entram na fila, como no web.
    execAsync: (sql, opts) => enqueueWrite(() => direto.execAsync(sql, opts)),
    runAsync: (sql, params, ...rest) =>
      enqueueWrite(() => direto.runAsync(sql, params, ...rest)),
    // Leituras não entram na fila (mesma decisão, e mesmas limitações, do web).
    getFirstAsync: (sql, params, ...rest) => direto.getFirstAsync(sql, params, ...rest),
    getAllAsync: (sql, params, ...rest) => direto.getAllAsync(sql, params, ...rest),

    withTransactionAsync<T>(callback: (tx: DbTransaction) => Promise<T>): Promise<T> {
      return enqueueWrite(async () => {
        // `withTransactionAsync` do expo é explicitamente NÃO exclusivo: outra
        // escrita pode entrar no meio. A variante exclusiva é a que entrega o
        // `txn` e serializa de verdade.
        //
        // O valor devolvido pelo callback é capturado aqui porque o expo
        // descarta o retorno do task — sem isto, `withTransactionAsync` era
        // tipado como Promise<T> e resolvia `undefined` no nativo, enquanto o
        // web devolvia o valor certo.
        let resultado!: T;
        await db.withExclusiveTransactionAsync(async (txn) => {
          resultado = await callback(adaptar(txn));
        });
        return resultado;
      });
    },
  };

  return conexao;
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
  recusarVersaoFutura(currentVersion);

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
 * O callback recebe `tx`, o executor ligado à transação. Todo SQL do bloco
 * passa por ele: escrever pela conexão aqui dentro entraria na fila e ficaria
 * esperando esta mesma transação terminar.
 */
async function runSingleMigration(
  db: AppDatabase,
  migration: { version: number; description: string; up: string },
): Promise<void> {
  try {
    await db.withTransactionAsync(async (tx) => {
      await tx.execAsync(migration.up);
      await tx.execAsync(`PRAGMA user_version = ${migration.version};`, { persist: false });
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
