import type { AppDatabase } from '@/types/app-database';

import type { ExerciseInput, ExerciseRow } from '@/types/db';

/**
 * Repositório de acesso à tabela `exercises`.
 *
 * Regra de "exclusão": exercícios NUNCA são deletados. "Excluir" significa
 * arquivar (`is_active = 0`), para que o histórico de sessões e recordes não
 * fique órfão. Exercícios arquivados saem da seleção mas continuam acessíveis
 * por ID (usado nas telas de histórico).
 */
export const exercisesRepository = {
  /**
   * Lista exercícios ativos (não arquivados), ordenados por nome.
   * Opcionalmente filtra por grupo muscular.
   */
  async listActive(
    db: AppDatabase,
    opts?: { muscleGroup?: string },
  ): Promise<ExerciseRow[]> {
    if (opts?.muscleGroup) {
      return db.getAllAsync<ExerciseRow>(
        `SELECT * FROM exercises
         WHERE is_active = 1 AND muscle_group = ?
         ORDER BY name COLLATE NOCASE;`,
        [opts.muscleGroup],
      );
    }
    return db.getAllAsync<ExerciseRow>(
      `SELECT * FROM exercises
       WHERE is_active = 1
       ORDER BY name COLLATE NOCASE;`,
    );
  },

  /**
   * Busca um exercício pelo id (ativo ou arquivado).
   * Retorna null se não existir.
   */
  async getById(db: AppDatabase, id: number): Promise<ExerciseRow | null> {
    const row = await db.getFirstAsync<ExerciseRow>(
      'SELECT * FROM exercises WHERE id = ?;',
      [id],
    );
    return row ?? null;
  },

  /**
   * Busca exercícios por nome (contém), case-insensitive.
   * Útil para o autocomplete ao montar uma ficha.
   */
  async searchByName(
    db: AppDatabase,
    query: string,
  ): Promise<ExerciseRow[]> {
    const like = `%${query}%`;
    return db.getAllAsync<ExerciseRow>(
      `SELECT * FROM exercises
       WHERE is_active = 1 AND name LIKE ? COLLATE NOCASE
       ORDER BY name COLLATE NOCASE;`,
      [like],
    );
  },

  /**
   * Cria um exercício personalizado (`is_custom = 1`, `is_active = 1`).
   * Retorna o id do novo exercício.
   */
  async create(db: AppDatabase, input: ExerciseInput): Promise<number> {
    const result = await db.runAsync(
      `INSERT INTO exercises (
        name, muscle_group, secondary_muscles, equipment, difficulty,
        instructions, common_mistakes, video_url, is_custom, is_active
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1);`,
      [
        input.name,
        input.muscle_group,
        input.secondary_muscles ?? null,
        input.equipment ?? null,
        input.difficulty ?? null,
        input.instructions ?? null,
        input.common_mistakes ?? null,
        input.video_url ?? null,
      ],
    );
    return result.lastInsertRowId as number;
  },

  /**
   * Atualiza dados editáveis de um exercício.
   * Não mexe em `is_custom` nem `is_active`.
   */
  async update(
    db: AppDatabase,
    id: number,
    input: Partial<ExerciseInput>,
  ): Promise<void> {
    await db.runAsync(
      `UPDATE exercises SET
        name              = COALESCE(?, name),
        muscle_group      = COALESCE(?, muscle_group),
        secondary_muscles = COALESCE(?, secondary_muscles),
        equipment         = COALESCE(?, equipment),
        difficulty        = COALESCE(?, difficulty),
        instructions      = COALESCE(?, instructions),
        common_mistakes   = COALESCE(?, common_mistakes),
        video_url         = COALESCE(?, video_url)
      WHERE id = ?;`,
      [
        input.name ?? null,
        input.muscle_group ?? null,
        input.secondary_muscles ?? null,
        input.equipment ?? null,
        input.difficulty ?? null,
        input.instructions ?? null,
        input.common_mistakes ?? null,
        input.video_url ?? null,
        id,
      ],
    );
  },

  /**
   * Arquiva um exercício (soft delete).
   *
   * O exercício some da seleção mas permanece no banco, preservando o
   * histórico de sessões e recordes que o referenciam.
   */
  async archive(db: AppDatabase, id: number): Promise<void> {
    await db.runAsync(
      'UPDATE exercises SET is_active = 0 WHERE id = ?;',
      [id],
    );
  },

  /**
   * Reativa um exercício arquivado.
   */
  async unarchive(db: AppDatabase, id: number): Promise<void> {
    await db.runAsync(
      'UPDATE exercises SET is_active = 1 WHERE id = ?;',
      [id],
    );
  },
};
