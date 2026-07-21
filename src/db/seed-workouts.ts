/**
 * Fichas de treino iniciais — rotina de 5 dias do usuário.
 *
 * Cada ficha referencia exercícios por NOME (normalizado). O seed resolve
 * o nome para id no momento da inserção, então a ordem dos exercícios no
 * seed-exercises.ts não importa.
 *
 * Estrutura de cada item da ficha:
 *  - exercise: nome do exercício (deve existir no seed-exercises.ts)
 *  - target_sets: número de séries planejadas
 *  - target_reps: faixa de repetições como texto (ex: "6-8", "10-12", "15")
 *  - target_rest_seconds: descanso em segundos
 *  - notes: observações (geralmente os músculos trabalhados)
 */
export interface SeedWorkoutItem {
  exercise: string;
  target_sets: number;
  target_reps: string;
  target_rest_seconds: number;
  notes?: string;
}

export interface SeedWorkout {
  name: string;
  division: string;
  /** Posição no ciclo de treinos (1, 2, 3...). NULL = não participa do ciclo. */
  cycle_order: number | null;
  items: SeedWorkoutItem[];
}

export const SEED_WORKOUTS: ReadonlyArray<SeedWorkout> = [
  // ───────────────────────────────────────────────────────────────────────
  // Segunda-feira — Superior A (ênfase em força)
  // ───────────────────────────────────────────────────────────────────────
  {
    name: 'Superior A',
    division: 'Superior · Força',
    cycle_order: 1,
    items: [
      { exercise: 'Supino reto com barra', target_sets: 4, target_reps: '6-8', target_rest_seconds: 120, notes: 'Peitoral, deltoide anterior e tríceps' },
      { exercise: 'Barra fixa pronada', target_sets: 4, target_reps: '6-8', target_rest_seconds: 120, notes: 'Grande dorsal e bíceps' },
      { exercise: 'Desenvolvimento com halteres', target_sets: 3, target_reps: '8-10', target_rest_seconds: 90, notes: 'Ombros' },
      { exercise: 'Remada curvada', target_sets: 3, target_reps: '8-10', target_rest_seconds: 90, notes: 'Costas' },
      { exercise: 'Supino inclinado halteres', target_sets: 3, target_reps: '10-12', target_rest_seconds: 90, notes: 'Peitoral superior' },
      { exercise: 'Rosca direta', target_sets: 3, target_reps: '10-12', target_rest_seconds: 60, notes: 'Bíceps' },
      { exercise: 'Tríceps corda', target_sets: 3, target_reps: '10-12', target_rest_seconds: 60, notes: 'Tríceps' },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────
  // Terça-feira — Inferior A
  // ───────────────────────────────────────────────────────────────────────
  {
    name: 'Inferior A',
    division: 'Inferior',
    cycle_order: 2,
    items: [
      { exercise: 'Agachamento livre', target_sets: 4, target_reps: '6-8', target_rest_seconds: 120, notes: 'Quadríceps e glúteos' },
      { exercise: 'Levantamento Romeno', target_sets: 4, target_reps: '8-10', target_rest_seconds: 120, notes: 'Posterior de coxa' },
      { exercise: 'Leg Press', target_sets: 3, target_reps: '10-12', target_rest_seconds: 90, notes: 'Quadríceps' },
      { exercise: 'Mesa flexora', target_sets: 3, target_reps: '10-12', target_rest_seconds: 75, notes: 'Posteriores' },
      { exercise: 'Panturrilha em pé', target_sets: 4, target_reps: '12-15', target_rest_seconds: 60, notes: 'Panturrilhas' },
      { exercise: 'Abdominal na polia', target_sets: 3, target_reps: '15', target_rest_seconds: 45, notes: 'Core' },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────
  // Quarta-feira — Superior B (volume)
  // ───────────────────────────────────────────────────────────────────────
  {
    name: 'Superior B',
    division: 'Superior · Volume',
    cycle_order: 3,
    items: [
      { exercise: 'Supino inclinado barra', target_sets: 4, target_reps: '8-10', target_rest_seconds: 90, notes: 'Peitoral' },
      { exercise: 'Remada baixa', target_sets: 4, target_reps: '8-10', target_rest_seconds: 90, notes: 'Costas' },
      { exercise: 'Crucifixo máquina', target_sets: 3, target_reps: '12-15', target_rest_seconds: 60, notes: 'Peitoral' },
      { exercise: 'Puxada neutra', target_sets: 3, target_reps: '10-12', target_rest_seconds: 75, notes: 'Dorsais' },
      { exercise: 'Elevação lateral', target_sets: 4, target_reps: '12-15', target_rest_seconds: 60, notes: 'Deltoide lateral' },
      { exercise: 'Rosca Scott', target_sets: 3, target_reps: '10-12', target_rest_seconds: 60, notes: 'Bíceps' },
      { exercise: 'Tríceps francês', target_sets: 3, target_reps: '10-12', target_rest_seconds: 60, notes: 'Tríceps' },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────
  // Quinta-feira — Inferior B
  // ───────────────────────────────────────────────────────────────────────
  {
    name: 'Inferior B',
    division: 'Inferior',
    cycle_order: 4,
    items: [
      { exercise: 'Levantamento terra', target_sets: 4, target_reps: '5-6', target_rest_seconds: 150, notes: 'Cadeia posterior' },
      { exercise: 'Agachamento búlgaro', target_sets: 3, target_reps: '10 cada perna', target_rest_seconds: 90, notes: 'Glúteos e quadríceps' },
      { exercise: 'Cadeira extensora', target_sets: 3, target_reps: '12-15', target_rest_seconds: 60, notes: 'Quadríceps' },
      { exercise: 'Flexora sentado', target_sets: 3, target_reps: '12-15', target_rest_seconds: 60, notes: 'Posteriores' },
      { exercise: 'Hip Thrust', target_sets: 3, target_reps: '8-10', target_rest_seconds: 90, notes: 'Glúteos' },
      { exercise: 'Panturrilha sentado', target_sets: 4, target_reps: '15-20', target_rest_seconds: 60, notes: 'Sóleo' },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────
  // Sexta-feira — Superior C (ênfase em braços e ombros)
  // ───────────────────────────────────────────────────────────────────────
  {
    name: 'Superior C',
    division: 'Superior · Braços e ombros',
    cycle_order: 5,
    items: [
      { exercise: 'Paralelas', target_sets: 4, target_reps: '8-10', target_rest_seconds: 90, notes: 'Peitoral inferior e tríceps' },
      { exercise: 'Barra fixa supinada', target_sets: 4, target_reps: '8-10', target_rest_seconds: 90, notes: 'Costas e bíceps' },
      { exercise: 'Desenvolvimento máquina', target_sets: 3, target_reps: '10-12', target_rest_seconds: 90, notes: 'Ombros' },
      { exercise: 'Face Pull', target_sets: 3, target_reps: '15', target_rest_seconds: 60, notes: 'Deltoide posterior e manguito' },
      { exercise: 'Rosca martelo', target_sets: 3, target_reps: '10-12', target_rest_seconds: 60, notes: 'Braquial e braquiorradial' },
      { exercise: 'Tríceps testa', target_sets: 3, target_reps: '10-12', target_rest_seconds: 60, notes: 'Tríceps' },
      { exercise: 'Elevação lateral na polia', target_sets: 3, target_reps: '15', target_rest_seconds: 45, notes: 'Deltoide lateral' },
    ],
  },
];
