import type { SeedWorkout } from './seed-workouts';

/**
 * Pacote "Treino Híbrido" — bloco de 6 a 8 semanas.
 *
 * Chega ARQUIVADO: o pacote em uso não é trocado sozinho. Para começar o
 * bloco, é um toque em Treinos → Trocar → Voltar a usar. Trocar limpa a
 * programação da semana, então a decisão de quando virar é do usuário.
 *
 * A corrida NÃO virou ficha nem exercício. O app registra série com carga e
 * repetições, e 5 km em 32 min não cabe nesse formato: entraria como número
 * solto e sujaria volume, 1RM e recordes. Ela é prescrição, e mora em
 * `PACK_HIBRIDO_CORRIDAS` — presa ao dia da semana, que é o que o calendário e
 * a montagem automática da semana consultam.
 *
 * Descanso: quando o programa dá uma faixa ("2–3 min"), fica gravado o limite
 * INFERIOR. O cronômetro apita no mínimo e esperar mais é sempre possível;
 * o contrário, não.
 *
 * Repetições: o texto do programa é preservado como veio, inclusive o "/lado"
 * dos unilaterais — `target_reps` é texto livre justamente para isso.
 */
export const PACK_HIBRIDO_NOME = 'Treino Híbrido';

/** Uma corrida prescrita para um dia da semana. */
export interface CorridaDoDia {
  /** 0 = segunda, como em `scheduled_workouts` e no calendário. */
  dia: number;
  /** "aquecimento", "corrida curta", "intervalado"... */
  tipo: string;
  /** "1 km", "5 km", "3 × 1 km" — texto porque o formato varia. */
  volume: string;
  pace: string;
  /** Velocidade equivalente na esteira, da tabela de conversão do usuário. */
  esteira: string;
  /** `true` no dia sem musculação. É o que faz a semana automática pulá-lo. */
  somenteCorrida: boolean;
}

/**
 * O plano de corrida do bloco — a ÚNICA definição dele.
 *
 * Tudo que mostra corrida no app sai daqui: as linhas do calendário, a nota do
 * pacote, a prescrição durante o treino. Antes o mesmo plano estava escrito à
 * mão em três lugares como prosa, e prosa não responde "que dia é de corrida?"
 * — era por isso que a montagem automática ocupava a quarta.
 *
 * A corrida pertence ao DIA, não à ficha: remarcar um treino não muda o que se
 * corre na quarta.
 */
export const PACK_HIBRIDO_CORRIDAS: ReadonlyArray<CorridaDoDia> = [
  { dia: 0, tipo: 'aquecimento', volume: '1 km', pace: '7:15–7:45/km', esteira: '7,7–8,3 km/h', somenteCorrida: false },
  { dia: 1, tipo: 'corrida curta', volume: '1 km', pace: '6:50–7:15/km', esteira: '8,3–8,8 km/h', somenteCorrida: false },
  { dia: 2, tipo: 'corrida principal', volume: '5 km', pace: '6:20–6:30/km', esteira: '9,2–9,5 km/h', somenteCorrida: true },
  { dia: 3, tipo: 'intervalado', volume: '3 × 1 km', pace: '5:50–6:05/km', esteira: '9,9–10,3 km/h', somenteCorrida: false },
  { dia: 4, tipo: 'aquecimento', volume: '1 km', pace: '7:15–7:45/km', esteira: '7,7–8,3 km/h', somenteCorrida: false },
];

/**
 * Nota do pacote: o que o bloco é, sem repetir os números.
 *
 * A prescrição de cada dia agora aparece no calendário, no próprio dia. Repetir
 * aqui criaria duas versões da mesma coisa, que é exatamente o que se desfazia
 * sozinho quando uma delas mudasse.
 */
export const PACK_HIBRIDO_NOTAS =
  'Bloco híbrido: corrida antes da musculação, de segunda a sexta. ' +
  'A corrida de cada dia aparece no calendário, inclusive a de quarta, que é ' +
  'o único dia sem musculação.';

/**
 * Texto que a versão ANTERIOR gravou no banco.
 *
 * Existe só para o seed reconhecer o que ele mesmo escreveu e poder substituir
 * — nunca para comparar com texto do usuário. Sem isso, quem já recebeu o
 * pacote ficaria com a prosa antiga no cartão E a corrida estruturada no
 * calendário, dizendo a mesma coisa duas vezes.
 */
export const LEGADO_NOTAS_DO_PACOTE = [
  'Corrida antes da musculação, de segunda a sexta.',
  '',
  'Seg · aquecimento · 1 km · 7:15–7:45/km · esteira 7,7–8,3 km/h',
  'Ter · corrida curta · 1 km · 6:50–7:15/km · esteira 8,3–8,8 km/h',
  'Qua · corrida principal · 5 km · 6:20–6:30/km · esteira 9,2–9,5 km/h (sem musculação)',
  'Qui · intervalado · 3 × 1 km · 5:50–6:05/km · esteira 9,9–10,3 km/h',
  'Sex · aquecimento · 1 km · 7:15–7:45/km · esteira 7,7–8,3 km/h',
].join('\n');

/** As notas por ficha que a versão anterior gravou (mesma finalidade). */
export const LEGADO_NOTAS_DAS_FICHAS: Readonly<Record<string, string>> = {
  'Inferior A': 'Antes: aquecimento · 1 km · 7:15–7:45/km · esteira 7,7–8,3 km/h',
  'Superior A': 'Antes: corrida curta · 1 km · 6:50–7:15/km · esteira 8,3–8,8 km/h',
  'Superior B': 'Antes: intervalado · 3 × 1 km · 5:50–6:05/km · esteira 9,9–10,3 km/h',
  'Inferior B': 'Antes: aquecimento · 1 km · 7:15–7:45/km · esteira 7,7–8,3 km/h',
};

export const PACK_HIBRIDO_WORKOUTS: ReadonlyArray<SeedWorkout> = [
  // ───────────────────────────────────────────────────────────────────────
  // Segunda — Inferior A (quadríceps + unilateral)
  // ───────────────────────────────────────────────────────────────────────
  {
    name: 'Inferior A',
    division: 'Quadríceps + unilateral',
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
