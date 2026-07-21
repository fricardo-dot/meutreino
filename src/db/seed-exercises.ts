import type { ExerciseInput } from '@/types/db';

/**
 * Banco inicial de exercícios — personalizado com a rotina do usuário.
 *
 * A unicidade é garantida pelo índice `idx_exercises_name_unique` (v3), que
 * normaliza LOWER(TRIM(name)). O seed usa INSERT OR IGNORE, então pode ser
 * executado quantas vezes for necessário sem duplicar.
 */
export const SEED_EXERCISES: ReadonlyArray<
  Pick<ExerciseInput, 'name' | 'muscle_group' | 'equipment' | 'difficulty'> & {
    secondary_muscles?: string;
  }
> = [
  // ── Peito ──────────────────────────────────────────────────────────────
  { name: 'Supino reto com barra', muscle_group: 'peito', equipment: 'barra', difficulty: 'intermediário', secondary_muscles: 'deltoide anterior, tríceps' },
  { name: 'Supino inclinado halteres', muscle_group: 'peito', equipment: 'halteres', difficulty: 'intermediário', secondary_muscles: 'deltoide anterior, tríceps' },
  { name: 'Supino inclinado barra', muscle_group: 'peito', equipment: 'barra', difficulty: 'intermediário', secondary_muscles: 'deltoide anterior, tríceps' },
  { name: 'Crucifixo máquina', muscle_group: 'peito', equipment: 'máquina', difficulty: 'iniciante' },
  { name: 'Paralelas', muscle_group: 'peito', equipment: 'peso do corpo', difficulty: 'avançado', secondary_muscles: 'tríceps, deltoide anterior' },

  // ── Costas ─────────────────────────────────────────────────────────────
  { name: 'Barra fixa pronada', muscle_group: 'costas', equipment: 'peso do corpo', difficulty: 'avançado', secondary_muscles: 'bíceps' },
  { name: 'Barra fixa supinada', muscle_group: 'costas', equipment: 'peso do corpo', difficulty: 'intermediário', secondary_muscles: 'bíceps' },
  { name: 'Puxada alta', muscle_group: 'costas', equipment: 'máquina', difficulty: 'iniciante', secondary_muscles: 'bíceps' },
  { name: 'Puxada neutra', muscle_group: 'costas', equipment: 'máquina', difficulty: 'iniciante', secondary_muscles: 'bíceps' },
  { name: 'Remada curvada', muscle_group: 'costas', equipment: 'barra', difficulty: 'intermediário', secondary_muscles: 'bíceps' },
  { name: 'Remada baixa', muscle_group: 'costas', equipment: 'máquina', difficulty: 'iniciante', secondary_muscles: 'bíceps' },

  // ── Pernas (quadríceps e glúteos) ──────────────────────────────────────
  { name: 'Agachamento livre', muscle_group: 'pernas', equipment: 'barra', difficulty: 'avançado', secondary_muscles: 'glúteos, core' },
  { name: 'Agachamento búlgaro', muscle_group: 'pernas', equipment: 'halteres', difficulty: 'intermediário', secondary_muscles: 'glúteos' },
  { name: 'Leg Press', muscle_group: 'pernas', equipment: 'máquina', difficulty: 'iniciante' },
  { name: 'Cadeira extensora', muscle_group: 'pernas', equipment: 'máquina', difficulty: 'iniciante' },
  { name: 'Hip Thrust', muscle_group: 'pernas', equipment: 'barra', difficulty: 'intermediário', secondary_muscles: 'posterior' },

  // ── Pernas (posteriores) ───────────────────────────────────────────────
  { name: 'Levantamento Romeno', muscle_group: 'pernas', equipment: 'barra', difficulty: 'intermediário', secondary_muscles: 'glúteos, lombar' },
  { name: 'Levantamento terra', muscle_group: 'pernas', equipment: 'barra', difficulty: 'avançado', secondary_muscles: 'costas, core, antebraços' },
  { name: 'Mesa flexora', muscle_group: 'pernas', equipment: 'máquina', difficulty: 'iniciante' },
  { name: 'Flexora sentado', muscle_group: 'pernas', equipment: 'máquina', difficulty: 'iniciante' },

  // ── Panturrilhas ───────────────────────────────────────────────────────
  { name: 'Panturrilha em pé', muscle_group: 'pernas', equipment: 'máquina', difficulty: 'iniciante' },
  { name: 'Panturrilha sentado', muscle_group: 'pernas', equipment: 'máquina', difficulty: 'iniciante', secondary_muscles: 'sóleo' },

  // ── Ombros ─────────────────────────────────────────────────────────────
  { name: 'Desenvolvimento com halteres', muscle_group: 'ombros', equipment: 'halteres', difficulty: 'intermediário', secondary_muscles: 'tríceps' },
  { name: 'Desenvolvimento máquina', muscle_group: 'ombros', equipment: 'máquina', difficulty: 'iniciante' },
  { name: 'Elevação lateral', muscle_group: 'ombros', equipment: 'halteres', difficulty: 'iniciante' },
  { name: 'Elevação lateral na polia', muscle_group: 'ombros', equipment: 'cabo', difficulty: 'iniciante' },
  { name: 'Face Pull', muscle_group: 'ombros', equipment: 'cabo', difficulty: 'intermediário', secondary_muscles: 'manguito rotador' },

  // ── Braços (bíceps) ────────────────────────────────────────────────────
  { name: 'Rosca direta', muscle_group: 'braços', equipment: 'barra', difficulty: 'iniciante' },
  { name: 'Rosca Scott', muscle_group: 'braços', equipment: 'máquina', difficulty: 'iniciante' },
  { name: 'Rosca martelo', muscle_group: 'braços', equipment: 'halteres', difficulty: 'iniciante', secondary_muscles: 'braquial, braquiorradial' },

  // ── Braços (tríceps) ───────────────────────────────────────────────────
  { name: 'Tríceps corda', muscle_group: 'braços', equipment: 'cabo', difficulty: 'iniciante' },
  { name: 'Tríceps francês', muscle_group: 'braços', equipment: 'halteres', difficulty: 'intermediário' },
  { name: 'Tríceps testa', muscle_group: 'braços', equipment: 'barra', difficulty: 'intermediário' },

  // ── Core ───────────────────────────────────────────────────────────────
  { name: 'Abdominal na polia', muscle_group: 'core', equipment: 'cabo', difficulty: 'iniciante' },
];
