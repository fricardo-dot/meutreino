import type { AppDatabase } from '@/types/app-database';

import type { BodyWeightEntryInput, BodyWeightEntryRow } from '@/types/db';

/**
 * Repositório de acesso a `body_weight_entries` (histórico de pesagens).
 *
 * UNIQUE(date) garante uma pesagem por dia — regravar o mesmo dia faz UPSERT.
 */
export const bodyWeightRepository = {
  /**
   * Insere ou atualiza a pesagem de um dia. Retorna o id.
   */
  async upsert(db: AppDatabase, input: BodyWeightEntryInput): Promise<number> {
    const result = await db.runAsync(
      `INSERT INTO body_weight_entries (weight_kg, date, notes)
       VALUES (?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET
         weight_kg = excluded.weight_kg,
         notes     = excluded.notes;`,
      [input.weight_kg, input.date, input.notes ?? null],
    );
    return result.lastInsertRowId as number;
  },

  /**
   * Última pesagem registrada (mais recente). Null se nenhuma.
   */
  async getLatest(db: AppDatabase): Promise<BodyWeightEntryRow | null> {
    const row = await db.getFirstAsync<BodyWeightEntryRow>(
      `SELECT * FROM body_weight_entries ORDER BY date DESC LIMIT 1;`,
    );
    return row ?? null;
  },

  /**
   * Histórico de pesagens em ordem ascendente (para gráfico de evolução).
   * Opcionalmente limitado aos últimos N registros.
   */
  async listHistory(
    db: AppDatabase,
    limit?: number,
  ): Promise<BodyWeightEntryRow[]> {
    if (limit !== undefined) {
      return db.getAllAsync<BodyWeightEntryRow>(
        `SELECT * FROM (
           SELECT * FROM body_weight_entries ORDER BY date DESC LIMIT ?
         ) sub ORDER BY date ASC;`,
        [limit],
      );
    }
    return db.getAllAsync<BodyWeightEntryRow>(
      `SELECT * FROM body_weight_entries ORDER BY date ASC;`,
    );
  },

  /**
   * Remove uma pesagem pelo id.
   */
  async remove(db: AppDatabase, id: number): Promise<void> {
    await db.runAsync('DELETE FROM body_weight_entries WHERE id = ?;', [id]);
  },
};
