import type { AppDatabase } from '@/types/app-database';

import type { UserProfileInput, UserProfileRow } from '@/types/db';

/**
 * Repositório de acesso à tabela `user_profile` (singleton — sempre id=1).
 *
 * A linha é criada sob demanda (UPSERT) na primeira leitura/escrita.
 */
export const userProfileRepository = {
  /**
   * Lê o perfil (cria linha vazia se não existir). Sempre retorna um objeto.
   */
  async getOrCreate(db: AppDatabase): Promise<UserProfileRow> {
    await db.runAsync(
      `INSERT OR IGNORE INTO user_profile (id) VALUES (1);`,
    );
    const row = await db.getFirstAsync<UserProfileRow>(
      'SELECT * FROM user_profile WHERE id = 1;',
    );
    // Sempre existe após o INSERT OR IGNORE acima.
    return row as UserProfileRow;
  },

  /**
   * Atualiza campos do perfil (apenas os informados).
   */
  async update(
    db: AppDatabase,
    input: UserProfileInput,
  ): Promise<void> {
    await db.runAsync(
      `UPDATE user_profile SET
        name             = COALESCE(?, name),
        birth_date       = COALESCE(?, birth_date),
        sex              = COALESCE(?, sex),
        height_cm        = COALESCE(?, height_cm),
        target_weight_kg = COALESCE(?, target_weight_kg),
        updated_at       = CURRENT_TIMESTAMP
       WHERE id = 1;`,
      [
        input.name ?? null,
        input.birth_date ?? null,
        input.sex ?? null,
        input.height_cm ?? null,
        input.target_weight_kg ?? null,
      ],
    );
  },
};
