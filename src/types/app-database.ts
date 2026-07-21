/**
 * Interface própria do banco de dados do app.
 *
 * Desacopla os repositórios do `expo-sqlite`. Tanto o client nativo quanto o
 * client web implementam esta interface — os repositórios não sabem (nem
 * precisam saber) qual motor está rodando embaixo.
 *
 * Esta interface cobre exatamente os métodos usados pelo app:
 *  - execAsync: DDL multi-statement, PRAGMAs
 *  - runAsync: INSERT/UPDATE/DELETE
 *  - getFirstAsync: SELECT de 1 linha
 *  - getAllAsync: SELECT de N linhas
 *  - withTransactionAsync: bloco atômico (BEGIN/COMMIT ou SAVEPOINT)
 */

/** Valores que podem ser bindados em parâmetros `?`. */
export type SqlParameter = string | number | null | Uint8Array;

/** Opções internas do execAsync (não usadas pelos repositórios). */
export interface ExecOptions {
  /**
   * Se true (padrão), marca o banco como "dirty" e dispara persistência
   * (no web). Se false, não persiste — usado para PRAGMAs e SELECTs.
   * O client nativo ignora esta opção.
   */
  persist?: boolean;
}

/** Resultado de uma operação de escrita (INSERT/UPDATE/DELETE). */
export interface RunResult {
  /** id da última linha inserida (LAST_INSERT_ROWID()). */
  lastInsertRowId: number;
  /** Número de linhas afetadas. */
  changes: number;
}

export interface AppDatabase {
  /**
   * Executa SQL sem retorno de linhas (DDL, PRAGMA, multi-statement).
   *
   * @param opts.persist Se false, não marca o banco como alterado.
   *                     Default: true. Client nativo ignora esta opção.
   */
  execAsync(sql: string, opts?: ExecOptions): Promise<void>;

  /**
   * Executa INSERT/UPDATE/DELETE com parâmetros posicionais (`?`).
   *
   * Aceita params como array OU como rest args (compatibilidade com
   * expo-sqlite e com o código existente que usa array).
   */
  runAsync(
    sql: string,
    params?: SqlParameter[] | SqlParameter,
    ...rest: SqlParameter[]
  ): Promise<RunResult>;

  /**
   * SELECT de no máximo 1 linha. Retorna null se não houver resultado.
   * Cada coluna é retornada como propriedade nomeada (pelos nomes do SELECT).
   */
  getFirstAsync<T>(
    sql: string,
    params?: SqlParameter[] | SqlParameter,
    ...rest: SqlParameter[]
  ): Promise<T | null>;

  /**
   * SELECT de N linhas. Retorna array (vazio se nenhuma).
   */
  getAllAsync<T>(
    sql: string,
    params?: SqlParameter[] | SqlParameter,
    ...rest: SqlParameter[]
  ): Promise<T[]>;

  /**
   * Executa o callback numa transação atômica.
   *
   * - No nível 0: BEGIN/COMMIT/ROLLBACK.
   * - Em níveis aninhados: SAVEPOINT/RELEASE/ROLLBACK TO.
   *
   * Se o callback lançar, a transação é desfeita e o erro propagado.
   */
  withTransactionAsync<T>(callback: () => Promise<T>): Promise<T>;
}
