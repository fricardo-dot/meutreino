import type { AppDatabase } from '@/types/app-database';

import { appMetadataRepository } from '@/repositories/app-metadata.repository';
import { SEED_EXERCISES } from './seed-exercises';
import { SEED_WORKOUTS } from './seed-workouts';

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

  // 3. Fichas iniciais — só UMA vez.
  const workoutsSeeded = await appMetadataRepository.get(db, SEED_WORKOUTS_KEY);
  if (workoutsSeeded === null) {
    await seedWorkouts(db);
    await appMetadataRepository.set(db, SEED_WORKOUTS_KEY, '1');
  }
}

/**
 * Cria as fichas iniciais e seus exercícios, resolvendo nomes para IDs.
 *
 * Se um exercício da ficha não existir no banco (ex: foi arquivado), ele é
 * IGNORADO — a ficha é criada sem ele. Não quebra o seed.
 */
async function seedWorkouts(db: AppDatabase): Promise<void> {
  for (const workout of SEED_WORKOUTS) {
    // Cria a ficha.
    const result = await db.runAsync(
      `INSERT INTO workouts (name, division, cycle_order) VALUES (?, ?, ?);`,
      [workout.name, workout.division, workout.cycle_order ?? null],
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
