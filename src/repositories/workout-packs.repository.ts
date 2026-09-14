import type { AppDatabase } from '@/types/app-database';

import type { DbExecutor } from '@/types/db-executor';
import type { WorkoutPackRow } from '@/types/db';

/** Pacote com o número de fichas que ele contém, para a lista. */
export interface WorkoutPackSummary extends WorkoutPackRow {
  workout_count: number;
}

/**
 * Repositório de acesso a `workout_packs`.
 *
 * Pacote é o conjunto de fichas seguido num período (mesociclo). Exatamente um
 * fica ativo — o índice único parcial do schema garante que nunca haja dois, e
 * o app nunca arquiva um sem colocar outro no lugar, então nunca há zero.
 *
 * Pacote não se apaga: arquiva. O histórico de sessões referencia as fichas
 * dele, e `workouts.pack_id` usa ON DELETE RESTRICT justamente para impedir
 * que uma exclusão leve esse histórico junto.
 */
export const workoutPacksRepository = {
  /** O pacote ativo. Null só se o banco estiver num estado que não deveria existir. */
  async getActive(db: DbExecutor): Promise<WorkoutPackRow | null> {
    const row = await db.getFirstAsync<WorkoutPackRow>(
      'SELECT * FROM workout_packs WHERE is_active = 1 LIMIT 1;',
    );
    return row ?? null;
  },

  /**
   * Lista todos os pacotes: o ativo primeiro, depois os arquivados do mais
   * recente para o mais antigo.
   */
  async list(db: DbExecutor): Promise<WorkoutPackSummary[]> {
    return db.getAllAsync<WorkoutPackSummary>(
      `SELECT
         p.*,
         (SELECT COUNT(*) FROM workouts w
           WHERE w.pack_id = p.id AND w.is_active = 1) AS workout_count
       FROM workout_packs p
       ORDER BY p.is_active DESC, p.archived_at DESC, p.id DESC;`,
    );
  },

  async getById(db: DbExecutor, id: number): Promise<WorkoutPackRow | null> {
    const row = await db.getFirstAsync<WorkoutPackRow>(
      'SELECT * FROM workout_packs WHERE id = ?;',
      [id],
    );
    return row ?? null;
  },

  /** Renomeia um pacote (ativo ou arquivado). */
  async rename(db: DbExecutor, id: number, name: string): Promise<void> {
    await db.runAsync('UPDATE workout_packs SET name = ? WHERE id = ?;', [name, id]);
  },

  /**
   * Cria um pacote e o torna ativo, arquivando o que estava em uso.
   *
   * `copiarDoAtual` reproduz as fichas do pacote que está saindo — com os
   * exercícios, séries-alvo e posição no ciclo — para quando o próximo bloco é
   * uma progressão do anterior e não um treino do zero.
   *
   * A troca inteira acontece numa transação: ou o pacote novo entra completo e
   * ativo, ou nada muda. Sem isso, uma falha no meio deixaria o banco sem
   * pacote ativo — estado que a tela de Treinos não sabe representar.
   *
   * @returns id do pacote criado.
   */
  async createAndActivate(
    db: AppDatabase,
    name: string,
    copiarDoAtual: boolean,
  ): Promise<number> {
    let novoId = 0;

    await db.withTransactionAsync(async (tx) => {
      const anterior = await this.getActive(tx);

      // Arquiva o atual ANTES de inserir o novo: o índice único parcial não
      // deixa dois ativos coexistirem nem por um instante.
      if (anterior) {
        await arquivar(tx, anterior.id);
      }

      const criado = await tx.runAsync(
        `INSERT INTO workout_packs (name, is_active) VALUES (?, 1);`,
        [name],
      );
      novoId = criado.lastInsertRowId;

      if (copiarDoAtual && anterior) {
        await copiarFichas(tx, anterior.id, novoId);
      }

      await limparProgramacaoFutura(tx);
    });

    return novoId;
  },

  /**
   * Reativa um pacote arquivado, arquivando o que está em uso — uma troca.
   *
   * É sempre reversível: o pacote que sai continua lá, com as fichas e o
   * histórico intactos, pronto para voltar.
   */
  async activate(db: AppDatabase, packId: number): Promise<void> {
    await db.withTransactionAsync(async (tx) => {
      const atual = await this.getActive(tx);
      if (atual && atual.id === packId) return;

      if (atual) {
        await arquivar(tx, atual.id);
      }
      await tx.runAsync(
        `UPDATE workout_packs SET is_active = 1, archived_at = NULL WHERE id = ?;`,
        [packId],
      );

      await limparProgramacaoFutura(tx);
    });
  },
};

/** Tira um pacote de uso, registrando quando. */
async function arquivar(tx: DbExecutor, packId: number): Promise<void> {
  await tx.runAsync(
    `UPDATE workout_packs
        SET is_active = 0, archived_at = CURRENT_TIMESTAMP
      WHERE id = ?;`,
    [packId],
  );
}

/**
 * Duplica as fichas de um pacote para outro, com exercícios e alvos.
 *
 * Só copia ficha ativa: arquivada não faz parte do treino que está sendo
 * levado adiante.
 */
async function copiarFichas(
  tx: DbExecutor,
  origemPackId: number,
  destinoPackId: number,
): Promise<void> {
  const fichas = await tx.getAllAsync<{
    id: number;
    name: string;
    division: string | null;
    notes: string | null;
    cycle_order: number | null;
  }>(
    `SELECT id, name, division, notes, cycle_order
       FROM workouts
      WHERE pack_id = ? AND is_active = 1
      ORDER BY cycle_order, id;`,
    [origemPackId],
  );

  for (const ficha of fichas) {
    const nova = await tx.runAsync(
      `INSERT INTO workouts (name, division, notes, cycle_order, pack_id)
       VALUES (?, ?, ?, ?, ?);`,
      [ficha.name, ficha.division, ficha.notes, ficha.cycle_order, destinoPackId],
    );
    const novoWorkoutId = nova.lastInsertRowId;

    // `workout_exercises` referencia `exercises`, que é compartilhado entre
    // pacotes — copiamos o vínculo e os alvos, não o exercício em si.
    await tx.runAsync(
      `INSERT INTO workout_exercises
         (workout_id, exercise_id, sort_order, target_sets, target_reps,
          target_rest_seconds, notes)
       SELECT ?, exercise_id, sort_order, target_sets, target_reps,
              target_rest_seconds, notes
         FROM workout_exercises
        WHERE workout_id = ?
        ORDER BY sort_order;`,
      [novoWorkoutId, ficha.id],
    );
  }
}

/**
 * Limpa a programação da semana atual em diante.
 *
 * Trocar de pacote é começar outro bloco de treino: deixar os dias apontando
 * para fichas do pacote que saiu faria o calendário oferecer treino que não
 * está mais em uso. Semanas passadas ficam intactas — elas registram o que foi
 * planejado na época, e o histórico de sessões não é tocado de todo modo.
 */
async function limparProgramacaoFutura(tx: DbExecutor): Promise<void> {
  const hoje = new Date();
  const diaDaSemana = (hoje.getDay() + 6) % 7; // 0 = segunda
  const segunda = new Date(hoje);
  segunda.setDate(hoje.getDate() - diaDaSemana);
  const y = segunda.getFullYear();
  const m = String(segunda.getMonth() + 1).padStart(2, '0');
  const d = String(segunda.getDate()).padStart(2, '0');

  await tx.runAsync('DELETE FROM scheduled_workouts WHERE week_start_date >= ?;', [
    `${y}-${m}-${d}`,
  ]);
}
