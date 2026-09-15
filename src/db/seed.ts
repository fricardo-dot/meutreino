import type { AppDatabase, DbTransaction } from '@/types/app-database';

import { appMetadataRepository } from '@/repositories/app-metadata.repository';
import { SEED_EXERCISES } from './seed-exercises';
import { SEED_WORKOUTS, type SeedWorkout } from './seed-workouts';
import {
  LEGADO_NOTAS_DAS_FICHAS,
  LEGADO_NOTAS_DO_PACOTE,
  PACK_HIBRIDO_CORRIDAS,
  PACK_HIBRIDO_NOME,
  PACK_HIBRIDO_NOTAS,
  PACK_HIBRIDO_WORKOUTS,
} from './seed-pack-hibrido';

/**
 * Chave usada pelo teste de persistência da Fase 1.
 */
export const SQLITE_TEST_KEY = 'sqlite_test_weight';
export const SQLITE_TEST_VALUE = 12.5;

/**
 * Chave que marca que as fichas iniciais já foram criadas.
 * Evita recriar fichas (e duplicar) a cada inicialização.
 */
const SEED_WORKOUTS_KEY = 'seed_workouts_v1';

/**
 * Marca que o pacote "Treino Híbrido" já foi criado.
 *
 * Mesma mecânica do marcador das fichas iniciais: sem ele, o pacote seria
 * recriado a cada abertura, já que `workout_packs` não tem unicidade por nome.
 */
const SEED_PACK_HIBRIDO_KEY = 'seed_pack_hibrido_v1';

/**
 * Marca que as notas de corrida já foram preenchidas no pacote "Treino
 * Híbrido".
 *
 * Existe porque as notas chegaram DEPOIS do pacote: quem abriu o app entre as
 * duas versões ficou com o pacote criado e `seed_pack_hibrido_v1` gravado, e o
 * marcador de criação — corretamente — impede recriar. Sem este segundo
 * marcador, a prescrição de corrida nunca alcançaria esses bancos.
 *
 * Bumpar o marcador de criação NÃO resolveria: criaria um segundo pacote com o
 * mesmo nome.
 */
const SEED_PACK_HIBRIDO_NOTAS_KEY = 'seed_pack_hibrido_notas_v1';

/**
 * Marca que a corrida do bloco já foi gravada como DADO (tabela `pack_runs`).
 *
 * Terceiro marcador desta mesma linhagem, e pelo mesmo motivo dos anteriores:
 * o conteúdo mudou depois que o pacote já estava publicado. Aqui a mudança é
 * de forma — a mesma prescrição deixou de ser prosa e virou linha de tabela —
 * então além de gravar é preciso RETIRAR o texto antigo, senão o app passa a
 * dizer a mesma coisa em dois lugares.
 */
const SEED_PACK_HIBRIDO_CORRIDAS_KEY = 'seed_pack_hibrido_corridas_v1';

/**
 * Seed inicial do banco.
 *
 * IDEMPOTENTE: pode ser chamada em toda inicialização sem risco.
 *
 *  - O valor de teste (12.5) é gravado apenas se não existir.
 *  - Exercícios usam `INSERT OR IGNORE` (protegidos pela unicidade v3).
 *  - Fichas são criadas UMA ÚNICA vez (controlado por `seed_workouts_v1`
 *    em app_metadata). Não recriam em inicializações seguintes.
 *
 * Se o usuário já tem fichas/treinos próprios, o seed NÃO sobrescreve —
 * ele só cria as fichas iniciais na primeira vez.
 */
export async function ensureSeedData(db: AppDatabase): Promise<void> {
  // 1. Valor de teste da Fase 1.
  const existing = await appMetadataRepository.getNumber(db, SQLITE_TEST_KEY);
  if (existing === null) {
    await appMetadataRepository.setNumber(db, SQLITE_TEST_KEY, SQLITE_TEST_VALUE);
  }

  // 2. Exercícios pré-cadastrados.
  for (const ex of SEED_EXERCISES) {
    await db.runAsync(
      `INSERT OR IGNORE INTO exercises
        (name, muscle_group, secondary_muscles, equipment, difficulty, is_custom, is_active)
       VALUES (?, ?, ?, ?, ?, 0, 1);`,
      [
        ex.name,
        ex.muscle_group,
        ex.secondary_muscles ?? null,
        ex.equipment ?? null,
        ex.difficulty ?? null,
      ],
    );
  }

  // 3. Fichas iniciais — só UMA vez, e tudo ou nada.
  //
  // A transação é o que sustenta a idempotência prometida acima. Sem ela, as
  // fichas eram inseridas uma a uma e o marcador só era gravado no fim: fechar
  // a aba (ou uma falha de gravação) no meio deixava metade das fichas criadas
  // e o marcador ausente — na abertura seguinte o seed rodava de novo e
  // duplicava tudo, porque `workouts` não tem unicidade por nome.
  const workoutsSeeded = await appMetadataRepository.get(db, SEED_WORKOUTS_KEY);
  if (workoutsSeeded === null) {
    await db.withTransactionAsync(async (tx) => {
      await seedWorkouts(tx, SEED_WORKOUTS);
      await appMetadataRepository.set(tx, SEED_WORKOUTS_KEY, '1');
    });
  }

  // 4. Pacote "Treino Híbrido" — também só UMA vez, e também tudo ou nada.
  //
  // Entra ARQUIVADO: trocar o pacote em uso limpa a programação da semana, e
  // essa decisão é do usuário, não de uma atualização do app chegando sozinha.
  // Para começar o bloco: Treinos → Trocar → Voltar a usar.
  const packSeeded = await appMetadataRepository.get(db, SEED_PACK_HIBRIDO_KEY);
  if (packSeeded === null) {
    await db.withTransactionAsync(async (tx) => {
      const packId = await seedPackArquivado(
        tx,
        PACK_HIBRIDO_NOME,
        PACK_HIBRIDO_NOTAS,
        PACK_HIBRIDO_WORKOUTS,
      );
      await gravarCorridas(tx, packId);
      await appMetadataRepository.set(tx, SEED_PACK_HIBRIDO_KEY, '1');
      // Nasceu completo: nada a preencher nem a limpar depois.
      await appMetadataRepository.set(tx, SEED_PACK_HIBRIDO_NOTAS_KEY, '1');
      await appMetadataRepository.set(tx, SEED_PACK_HIBRIDO_CORRIDAS_KEY, '1');
    });
    return;
  }

  // 5. Pacote que já existia: a corrida precisa chegar nele como dado, e a
  //    prosa que a versão anterior gravou precisa sair.
  const corridasGravadas = await appMetadataRepository.get(
    db,
    SEED_PACK_HIBRIDO_CORRIDAS_KEY,
  );
  if (corridasGravadas === null) {
    await db.withTransactionAsync(async (tx) => {
      for (const packId of await acharPacotesDoHibrido(tx)) {
        await gravarCorridas(tx, packId);
        await trocarTextoLegado(tx, packId);
      }
      await appMetadataRepository.set(tx, SEED_PACK_HIBRIDO_CORRIDAS_KEY, '1');
      // Quem chega aqui já não precisa do passo antigo de notas.
      await appMetadataRepository.set(tx, SEED_PACK_HIBRIDO_NOTAS_KEY, '1');
    });
  }
}

/**
 * Grava a corrida de cada dia do bloco.
 *
 * `INSERT OR IGNORE` apoiado no índice único (pacote + dia): rodar de novo não
 * duplica, e uma corrida que o usuário já tenha ajustado fica como está.
 */
async function gravarCorridas(db: DbTransaction, packId: number): Promise<void> {
  for (const corrida of PACK_HIBRIDO_CORRIDAS) {
    await db.runAsync(
      `INSERT OR IGNORE INTO pack_runs
        (pack_id, day_of_week, kind, volume, pace, treadmill, run_only)
       VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        packId,
        corrida.dia,
        corrida.tipo,
        corrida.volume,
        corrida.pace,
        corrida.esteira,
        corrida.somenteCorrida ? 1 : 0,
      ],
    );
  }
}

/**
 * Tira do banco a prescrição em prosa que a versão anterior gravou.
 *
 * Compara com o texto EXATO que o próprio app escreveu. Qualquer outra coisa —
 * inclusive uma frase que o usuário tenha digitado — não é tocada: o app pode
 * desfazer o que ele mesmo fez, não o que é do usuário.
 *
 * Sem este passo o plano apareceria duas vezes: estruturado no calendário e
 * escrito no cartão do pacote e nas fichas.
 */
async function trocarTextoLegado(db: DbTransaction, packId: number): Promise<void> {
  await db.runAsync(
    'UPDATE workout_packs SET notes = ? WHERE id = ? AND notes = ?;',
    [PACK_HIBRIDO_NOTAS, packId, LEGADO_NOTAS_DO_PACOTE],
  );

  for (const [ficha, textoAntigo] of Object.entries(LEGADO_NOTAS_DAS_FICHAS)) {
    await db.runAsync(
      'UPDATE workouts SET notes = NULL WHERE pack_id = ? AND name = ? AND notes = ?;',
      [packId, ficha, textoAntigo],
    );
  }
}

/**
 * Os pacotes que contêm o bloco híbrido inteiro.
 *
 * "Inteiro" é o critério: as QUATRO fichas, cada uma batendo nome, divisão e
 * posição no ciclo. Bastar uma ou duas abriria espaço para acertar um pacote
 * do usuário que por acaso tenha uma ficha "Inferior A".
 */
async function acharPacotesDoHibrido(db: DbTransaction): Promise<number[]> {
  const condicao = PACK_HIBRIDO_WORKOUTS
    .map(() => '(name = ? AND division = ? AND cycle_order = ?)')
    .join(' OR ');
  const params: (string | number | null)[] = [];
  for (const ficha of PACK_HIBRIDO_WORKOUTS) {
    params.push(ficha.name, ficha.division, ficha.cycle_order ?? null);
  }
  params.push(PACK_HIBRIDO_WORKOUTS.length);

  const linhas = await db.getAllAsync<{ pack_id: number }>(
    `SELECT pack_id
       FROM workouts
      WHERE pack_id IS NOT NULL AND (${condicao})
      GROUP BY pack_id
     HAVING COUNT(DISTINCT name) = ?;`,
    params,
  );
  return linhas.map((l) => l.pack_id);
}

/**
 * Cria um pacote arquivado com as fichas dadas.
 *
 * `is_active = 0` de propósito: o índice único parcial recusaria um segundo
 * ativo, e mesmo que aceitasse, trocar o bloco de treino do usuário sem ele
 * pedir seria errado.
 */
async function seedPackArquivado(
  db: DbTransaction,
  nome: string,
  notas: string | null,
  fichas: ReadonlyArray<SeedWorkout>,
): Promise<number> {
  const pack = await db.runAsync(
    `INSERT INTO workout_packs (name, notes, is_active) VALUES (?, ?, 0);`,
    [nome, notas],
  );
  await seedWorkouts(db, fichas, pack.lastInsertRowId);
  return pack.lastInsertRowId;
}

/**
 * Cria as fichas iniciais e seus exercícios, resolvendo nomes para IDs.
 *
 * Se um exercício da ficha não existir no banco (ex: foi arquivado), ele é
 * IGNORADO — a ficha é criada sem ele. Não quebra o seed.
 */
async function seedWorkouts(
  db: DbTransaction,
  fichas: ReadonlyArray<SeedWorkout>,
  packId?: number,
): Promise<void> {
  for (const workout of fichas) {
    // Ficha sem pacote fica órfã e não aparece em tela nenhuma, porque a UI
    // filtra pelo pacote ativo. Sem `packId` explícito, vai para o ativo.
    const result = packId !== undefined
      ? await db.runAsync(
          `INSERT INTO workouts (name, division, notes, cycle_order, pack_id)
           VALUES (?, ?, ?, ?, ?);`,
          [
            workout.name,
            workout.division,
            workout.notes ?? null,
            workout.cycle_order ?? null,
            packId,
          ],
        )
      : await db.runAsync(
          `INSERT INTO workouts (name, division, notes, cycle_order, pack_id)
           VALUES (?, ?, ?, ?, (SELECT id FROM workout_packs WHERE is_active = 1));`,
          [
            workout.name,
            workout.division,
            workout.notes ?? null,
            workout.cycle_order ?? null,
          ],
        );
    const workoutId = result.lastInsertRowId as number;

    // Adiciona cada exercício da ficha.
    let sortOrder = 0;
    for (const item of workout.items) {
      // Resolve o nome (normalizado) para o id do exercício.
      const exercise = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM exercises
         WHERE is_active = 1 AND LOWER(TRIM(name)) = LOWER(TRIM(?))
         LIMIT 1;`,
        [item.exercise],
      );
      if (!exercise) {
        // Exercício não encontrado — ignora silenciosamente.
        continue;
      }

      await db.runAsync(
        `INSERT INTO workout_exercises
          (workout_id, exercise_id, sort_order, target_sets, target_reps, target_rest_seconds, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          workoutId,
          exercise.id,
          sortOrder,
          item.target_sets,
          item.target_reps,
          item.target_rest_seconds,
          item.notes ?? null,
        ],
      );
      sortOrder++;
    }
  }
}
