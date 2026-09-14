import type { SeedWorkout } from './seed-workouts';

/**
 * Pacote "Treino Híbrido" — bloco de 6 a 8 semanas.
 *
 * Chega ARQUIVADO: o pacote em uso não é trocado sozinho. Para começar o
 * bloco, é um toque em Treinos → Trocar → Voltar a usar. Trocar limpa a
 * programação da semana, então a decisão de quando virar é do usuário.
 *
 * A corrida de quarta-feira NÃO virou ficha. O app registra série com carga e
 * repetições, e 5 km em 32 min não cabe nesse formato: entraria como número
 * solto e sujaria volume, 1RM e recordes. Quarta fica livre no calendário.
 *
 * Descanso: quando o programa dá uma faixa ("2–3 min"), fica gravado o limite
 * INFERIOR. O cronômetro apita no mínimo e esperar mais é sempre possível;
 * o contrário, não.
 *
 * Repetições: o texto do programa é preservado como veio, inclusive o "/lado"
 * dos unilaterais — `target_reps` é texto livre justamente para isso.
 */
export const PACK_HIBRIDO_NOME = 'Treino Híbrido';

/**
 * Plano de corrida do bloco, guardado na nota do PACOTE.
 *
 * Fica aqui, e não como exercício de ficha, porque o app registra série com
 * carga e repetições: uma corrida logada nesse formato entraria no volume
 * total, no 1RM estimado e nos recordes, sujando as estatísticas de força com
 * números sem significado. Como prescrição, ela cumpre o papel — é lida antes
 * de correr — sem contaminar nada.
 *
 * Quarta-feira só aparece aqui: é o único dia sem musculação, então não há
 * ficha para carregar a informação.
 *
 * As velocidades vêm da tabela de conversão do próprio usuário.
 */
export const PACK_HIBRIDO_NOTAS = [
  'Corrida antes da musculação, de segunda a sexta.',
  '',
  'Seg · aquecimento · 1 km · 7:15–7:45/km · esteira 7,7–8,3 km/h',
  'Ter · corrida curta · 1 km · 6:50–7:15/km · esteira 8,3–8,8 km/h',
  'Qua · corrida principal · 5 km · 6:20–6:30/km · esteira 9,2–9,5 km/h (sem musculação)',
  'Qui · intervalado · 3 × 1 km · 5:50–6:05/km · esteira 9,9–10,3 km/h',
  'Sex · aquecimento · 1 km · 7:15–7:45/km · esteira 7,7–8,3 km/h',
].join('\n');

export const PACK_HIBRIDO_WORKOUTS: ReadonlyArray<SeedWorkout> = [
  // ───────────────────────────────────────────────────────────────────────
  // Segunda — Inferior A (quadríceps + unilateral)
  // ───────────────────────────────────────────────────────────────────────
  {
    name: 'Inferior A',
    division: 'Quadríceps + unilateral',
    notes: 'Antes: aquecimento · 1 km · 7:15–7:45/km · esteira 7,7–8,3 km/h',
    cycle_order: 1,
    items: [
      { exercise: 'Hack squat', target_sets: 3, target_reps: '6-10', target_rest_seconds: 120, notes: 'Quadríceps e glúteos' },
      { exercise: 'Leg press horizontal unilateral', target_sets: 3, target_reps: '8-12/lado', target_rest_seconds: 90 },
      { exercise: 'Extensora unilateral', target_sets: 2, target_reps: '10-15/lado', target_rest_seconds: 60 },
      { exercise: 'Flexora sentado', target_sets: 3, target_reps: '8-12', target_rest_seconds: 90, notes: 'Posterior de coxa' },
      { exercise: 'Panturrilha em pé unilateral', target_sets: 3, target_reps: '8-12/lado', target_rest_seconds: 60 },
      { exercise: 'Abdominal na polia', target_sets: 3, target_reps: '10-15', target_rest_seconds: 60 },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────
  // Terça — Superior A (força + hipertrofia)
  // ───────────────────────────────────────────────────────────────────────
  {
    name: 'Superior A',
    division: 'Força + hipertrofia',
    notes: 'Antes: corrida curta · 1 km · 6:50–7:15/km · esteira 8,3–8,8 km/h',
    cycle_order: 2,
    items: [
      { exercise: 'Supino reto com barra', target_sets: 3, target_reps: '5-8', target_rest_seconds: 120, notes: 'Peitoral, deltoide anterior e tríceps' },
      { exercise: 'Barra fixa pronada', target_sets: 3, target_reps: '6-10', target_rest_seconds: 120, notes: 'Dorsal e bíceps' },
      { exercise: 'Desenvolvimento com halteres', target_sets: 3, target_reps: '8-10', target_rest_seconds: 120 },
      { exercise: 'Remada máquina com apoio', target_sets: 3, target_reps: '8-12', target_rest_seconds: 120 },
      { exercise: 'Elevação lateral', target_sets: 3, target_reps: '12-20', target_rest_seconds: 60 },
      { exercise: 'Rosca inclinada', target_sets: 2, target_reps: '10-15', target_rest_seconds: 60 },
      { exercise: 'Tríceps corda', target_sets: 2, target_reps: '10-15', target_rest_seconds: 60 },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────
  // Quinta — Superior B (hipertrofia)
  // ───────────────────────────────────────────────────────────────────────
  {
    name: 'Superior B',
    division: 'Hipertrofia',
    notes: 'Antes: intervalado · 3 × 1 km · 5:50–6:05/km · esteira 9,9–10,3 km/h',
    cycle_order: 3,
    items: [
      { exercise: 'Supino inclinado halteres', target_sets: 3, target_reps: '8-12', target_rest_seconds: 120 },
      { exercise: 'Remada baixa neutra', target_sets: 3, target_reps: '8-12', target_rest_seconds: 120 },
      { exercise: 'Puxada neutra', target_sets: 3, target_reps: '10-15', target_rest_seconds: 90 },
      { exercise: 'Crucifixo máquina', target_sets: 2, target_reps: '12-15', target_rest_seconds: 60, notes: 'Ou crossover' },
      { exercise: 'Elevação lateral na polia', target_sets: 3, target_reps: '12-20', target_rest_seconds: 60 },
      { exercise: 'Crucifixo inverso', target_sets: 2, target_reps: '12-20', target_rest_seconds: 60, notes: 'Ou voador inverso' },
      { exercise: 'Rosca Scott', target_sets: 3, target_reps: '10-15', target_rest_seconds: 60 },
      { exercise: 'Tríceps francês na polia', target_sets: 3, target_reps: '10-15', target_rest_seconds: 60 },
    ],
  },

  // ───────────────────────────────────────────────────────────────────────
  // Sexta — Inferior B (posterior/glúteos + unilateral)
  // ───────────────────────────────────────────────────────────────────────
  {
    name: 'Inferior B',
    division: 'Posterior/glúteos + unilateral',
    notes: 'Antes: aquecimento · 1 km · 7:15–7:45/km · esteira 7,7–8,3 km/h',
    cycle_order: 4,
    items: [
      { exercise: 'Levantamento Romeno', target_sets: 3, target_reps: '6-10', target_rest_seconds: 120, notes: 'Terra romeno (RDL) — posterior e glúteos' },
      { exercise: 'Leg Press', target_sets: 3, target_reps: '10-15', target_rest_seconds: 120, notes: 'Leg press 45°' },
      { exercise: 'Búlgaro no Smith', target_sets: 2, target_reps: '8-12/lado', target_rest_seconds: 90 },
      { exercise: 'Flexora unilateral', target_sets: 2, target_reps: '10-15/lado', target_rest_seconds: 60 },
      { exercise: 'Hip Thrust', target_sets: 3, target_reps: '8-12', target_rest_seconds: 120, notes: 'Glúteos' },
      { exercise: 'Panturrilha sentada unilateral', target_sets: 3, target_reps: '12-20/lado', target_rest_seconds: 60 },
    ],
  },
];
