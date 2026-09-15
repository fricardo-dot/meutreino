import type { DbExecutor } from '@/types/db-executor';
import type { PackRunRow } from '@/types/db';

/**
 * Repositório das corridas prescritas por um pacote.
 *
 * Cada linha é "o que se corre na segunda", "na quarta" — a corrida é do DIA
 * da semana, não da ficha. Ficha é modelo e se remarca; o 5 km de quarta não
 * anda junto com ela.
 */
export const packRunsRepository = {
  /**
   * As corridas do pacote em uso, indexadas por dia da semana (0 = segunda).
   *
   * Devolve um mapa porque é assim que o calendário consome: ele tem o dia em
   * mãos e quer saber se há corrida nele. Uma lista obrigaria toda tela a
   * refazer a mesma busca.
   */
  async mapaDoPacoteAtivo(db: DbExecutor): Promise<Map<number, PackRunRow>> {
    const linhas = await db.getAllAsync<PackRunRow>(
      `SELECT * FROM pack_runs
        WHERE pack_id = (SELECT id FROM workout_packs WHERE is_active = 1)
        ORDER BY day_of_week;`,
    );
    return new Map(linhas.map((l) => [l.day_of_week, l]));
  },

  /** As corridas de um pacote qualquer — para espiar um arquivado. */
  async listByPack(db: DbExecutor, packId: number): Promise<PackRunRow[]> {
    return db.getAllAsync<PackRunRow>(
      'SELECT * FROM pack_runs WHERE pack_id = ? ORDER BY day_of_week;',
      [packId],
    );
  },

  /**
   * Os dias da semana em que o pacote ativo manda SÓ correr.
   *
   * É o que a montagem automática da semana precisa saber para não pôr
   * musculação em cima da corrida longa.
   */
  async diasSomenteCorrida(db: DbExecutor): Promise<number[]> {
    const linhas = await db.getAllAsync<{ day_of_week: number }>(
      `SELECT day_of_week FROM pack_runs
        WHERE run_only = 1
          AND pack_id = (SELECT id FROM workout_packs WHERE is_active = 1)
        ORDER BY day_of_week;`,
    );
    return linhas.map((l) => l.day_of_week);
  },
};

/**
 * "corrida principal · 5 km · 6:20–6:30/km · esteira 9,2–9,5 km/h"
 *
 * Uma única forma de escrever a corrida, usada por todas as telas — o motivo
 * de a prescrição ter virado dado foi justamente parar de reescrevê-la.
 */
export function descreverCorrida(run: PackRunRow): string {
  const partes = [run.kind, run.volume];
  if (run.pace) partes.push(run.pace);
  if (run.treadmill) partes.push(`esteira ${run.treadmill}`);
  return partes.join(' · ');
}
