import type { AppDatabase } from '@/types/app-database';

/**
 * Repositório de acesso à tabela `app_metadata`.
 *
 * Camada fina de acesso a dados — a UI nunca deve escrever SQL diretamente.
 * Centraliza as queries e devolve valores já tipados.
 *
 * Observação: `app_metadata` armazena tudo como TEXT. A conversão para número
 * fica a cargo de quem lê, via os helpers `getNumber`/`setNumber` abaixo.
 */
export const appMetadataRepository = {
  /**
   * Lê o valor bruto (string) associado à chave, ou null se não existir.
   */
  async get(db: AppDatabase, key: string): Promise<string | null> {
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_metadata WHERE key = ?;',
      [key],
    );
    return row?.value ?? null;
  },

  /**
   * Insere ou atualiza (upsert) o valor de uma chave.
   */
  async set(db: AppDatabase, key: string, value: string): Promise<void> {
    await db.runAsync(
      `INSERT INTO app_metadata (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
      [key, value],
    );
  },

  /**
   * Lê um valor numérico. Retorna null se a chave não existir.
   */
  async getNumber(db: AppDatabase, key: string): Promise<number | null> {
    const raw = await this.get(db, key);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  },

  /**
   * Grava um valor numérico. Cargas sempre como REAL — 12.5 é válido.
   */
  async setNumber(db: AppDatabase, key: string, value: number): Promise<void> {
    await this.set(db, key, String(value));
  },
};
