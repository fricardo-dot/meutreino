import type { CorridaDoDia } from './seed-pack-hibrido';
import type { SeedWorkout } from './seed-workouts';

/**
 * Pacote "Treino Híbrido 2" — bloco de 6 semanas sem corrida.
 *
 * A dor na banda iliotibial aparecia só correndo, por volta dos 2,5 km, então
 * o bloco troca a corrida por cardio sem impacto e mantém a musculação.
 *
 * Chega ARQUIVADO, como o anterior: trocar de pacote limpa a programação da
 * semana e encerra a contagem do bloco em uso, e isso é decisão do usuário.
 *
 * Supino e Levantamento Romeno seguem registrados por lado, sem a barra, porque
 * é assim que está todo o histórico. Mudar a convenção agora faria a carga
 * parecer ter dobrado sem nada ter mudado.
 */
export const PACK_HIBRIDO_2_NOME = 'Treino Híbrido 2';

export const PACK_HIBRIDO_2_NOTAS = [
  'Objetivo: hipertrofia, condicionamento, core e preparação para voltar a correr com segurança.',
  'Por enquanto, sem corrida e sem tiros.',
  '',
  'Semana 1: 2–3 repetições na reserva, para confirmar as cargas.',
  'Da semana 2 em diante: ao completar todas as séries no topo das repetições, com boa técnica e 1–2 na reserva, suba a carga no menor incremento.',
  'Semana 6: consolide, ou reduza o volume se houver fadiga.',
  '',
  'Pare o que reproduzir a dor lateral no joelho. Bicicleta e elíptico só continuam se forem confortáveis durante a sessão e nas 24 horas seguintes.',
  'Inchaço, falseio, limitação importante ou piora: procure avaliação presencial.',
  'Tempo máximo por treino: 1h30. Se apertar, corte primeiro o cardio e depois o core.',
].join('\n');

/**
 * O cardio e a mobilidade de cada dia.
 *
 * Moram no DIA, como a corrida do bloco anterior, e não na ficha: a quarta não
 * tem ficha nenhuma, e remarcar um treino não muda o que se faz naquele dia.
 */
export const PACK_HIBRIDO_2_ATIVIDADES: ReadonlyArray<CorridaDoDia> = [
  {
    dia: 0,
    tipo: 'bicicleta confortável',
    volume: '5–8 min',
    somenteCorrida: false,
    notas: 'Antes da musculação, com clamshell 2 × 12 por lado. Depois do treino: lateral do quadril e glúteos, 2 × 20–30 s por lado.',
    guia: ['clamshell', 'lateral-quadril', 'figura-4'],
  },
  {
    dia: 1,
    tipo: 'elíptico confortável',
    volume: '12–15 min',
    somenteCorrida: false,
    notas: 'Depois do core, ou em outro horário, sem dor. Depois do treino: glúteos e flexores do quadril, 2 × 20–30 s por lado.',
    guia: ['figura-4', 'flexores-quadril'],
  },
  {
    dia: 2,
    tipo: 'bicicleta ou elíptico',
    volume: '25 min nas semanas 1–2, 30 min nas 3–4, até 35 min nas 5–6',
    somenteCorrida: true,
    notas: 'Comece com 5 min fáceis (esforço 2–3/10). Parte principal de 15–25 min (esforço 4–5/10, conseguindo conversar). Termine com 5 min leves (esforço 2/10). Depois: clamshell 2 × 12 por lado e lateral do quadril, figura 4 e flexores, 2 × 20–30 s por lado.',
    guia: ['clamshell', 'lateral-quadril', 'figura-4', 'flexores-quadril'],
  },
  {
    dia: 3,
    tipo: 'bicicleta confortável',
    volume: '12–15 min',
    somenteCorrida: false,
    notas: 'Depois da musculação, se estiver sem dor. Depois do treino: lateral do quadril e flexores do quadril, 2 × 20–30 s por lado.',
    guia: ['lateral-quadril', 'flexores-quadril'],
  },
  {
    dia: 4,
    tipo: 'bicicleta confortável',
    volume: '5–8 min',
    somenteCorrida: false,
    notas: 'Antes da musculação, com clamshell 2 × 12 por lado. Depois do treino: lateral do quadril, glúteos e flexores do quadril, 2 × 20–30 s por lado.',
    guia: ['clamshell', 'lateral-quadril', 'figura-4', 'flexores-quadril'],
  },
];

/**
 * As fichas do bloco.
 *
 * As divisões são diferentes das do bloco anterior de propósito: o seed
 * reconhece o pacote "Treino Híbrido" por nome + divisão + posição das fichas,
 * e o novo não pode ser confundido com ele.
 *
 * Descanso: quando o plano dá uma faixa, fica o limite INFERIOR, como no bloco
 * anterior. O cronômetro apita no mínimo, e esperar mais é sempre possível.
 */
export const PACK_HIBRIDO_2_WORKOUTS: ReadonlyArray<SeedWorkout> = [
  {
    name: 'Inferior A',
    division: 'Quadríceps, posteriores e controle unilateral',
    notes: 'Antes: 2–3 séries progressivas de aquecimento no hack squat.',
    cycle_order: 1,
    items: [
      { exercise: 'Hack squat', target_sets: 3, target_reps: '8-10', target_rest_seconds: 120, notes: 'Quadríceps e glúteos; controlar a descida' },
      { exercise: 'Leg press horizontal unilateral', target_sets: 3, target_reps: '10-12/perna', target_rest_seconds: 90, notes: 'Começar pela esquerda' },
      { exercise: 'Extensora unilateral', target_sets: 2, target_reps: '12-15/perna', target_rest_seconds: 60, notes: 'Evitar impulso e dor' },
      { exercise: 'Flexora sentado', target_sets: 3, target_reps: '10-12', target_rest_seconds: 90, notes: 'Posteriores de coxa' },
      { exercise: 'Panturrilha em pé unilateral', target_sets: 3, target_reps: '12-15/perna', target_rest_seconds: 60, notes: 'Pausa breve no alto' },
    ],
  },
  {
    name: 'Superior A',
    division: 'Peito, costas, ombros, braços e Core A',
    notes: 'Antes: 5 min de aquecimento geral e séries progressivas de supino.',
    cycle_order: 2,
    items: [
      { exercise: 'Supino reto com barra', target_sets: 3, target_reps: '6-10', target_rest_seconds: 120, notes: 'Progredir primeiro nas repetições. Registre a carga por lado, sem a barra.' },
      { exercise: 'Puxada pronada ao peito', target_sets: 3, target_reps: '8-12', target_rest_seconds: 120, notes: 'Dorsais e bíceps' },
      { exercise: 'Desenvolvimento com halteres', target_sets: 3, target_reps: '8-12', target_rest_seconds: 120, notes: 'Ombros e tríceps' },
      { exercise: 'Remada máquina com apoio', target_sets: 2, target_reps: '10-12', target_rest_seconds: 90, notes: 'Evitar balanço' },
      { exercise: 'Elevação lateral', target_sets: 2, target_reps: '12-15', target_rest_seconds: 60, notes: 'Deltoide lateral' },
      { exercise: 'Rosca inclinada', target_sets: 2, target_reps: '10-15', target_rest_seconds: 60, notes: 'Bíceps' },
      { exercise: 'Tríceps corda', target_sets: 2, target_reps: '10-15', target_rest_seconds: 60, notes: 'Tríceps' },
      { exercise: 'Abdominal na polia', target_sets: 3, target_reps: '10-15', target_rest_seconds: 60, notes: 'Core A. Flexionar o tronco sem puxar com os braços' },
      { exercise: 'Prancha lateral', target_sets: 2, target_reps: '20-30 s/lado', target_rest_seconds: 45, notes: 'Core A. Registre os segundos no campo REPS, com peso 0.' },
    ],
  },
  {
    name: 'Superior B',
    division: 'Hipertrofia de peito, costas, ombros, braços e Core B',
    notes: 'Antes: 5 min de aquecimento geral e séries progressivas do supino inclinado.',
    cycle_order: 3,
    items: [
      { exercise: 'Supino inclinado halteres', target_sets: 3, target_reps: '8-12', target_rest_seconds: 120, notes: 'Peitoral superior e tríceps' },
      { exercise: 'Remada baixa neutra', target_sets: 3, target_reps: '8-12', target_rest_seconds: 120, notes: 'Dorsais e escápulas' },
      { exercise: 'Puxada neutra', target_sets: 3, target_reps: '10-12', target_rest_seconds: 90, notes: 'Dorsais e bíceps' },
      { exercise: 'Crucifixo máquina', target_sets: 2, target_reps: '12-15', target_rest_seconds: 60, notes: 'Amplitude confortável' },
      { exercise: 'Elevação lateral na polia', target_sets: 2, target_reps: '12-15', target_rest_seconds: 60, notes: 'Deltoide lateral' },
      { exercise: 'Crucifixo inverso', target_sets: 2, target_reps: '12-15', target_rest_seconds: 60, notes: 'No banco inclinado, peito apoiado, com halteres leves. Alternativa: face pull' },
      { exercise: 'Rosca Scott', target_sets: 2, target_reps: '10-15', target_rest_seconds: 60, notes: 'Bíceps' },
      { exercise: 'Tríceps francês na polia', target_sets: 2, target_reps: '10-15', target_rest_seconds: 60, notes: 'Tríceps' },
      { exercise: 'Abdominal reverso', target_sets: 3, target_reps: '10-15', target_rest_seconds: 60, notes: 'Core B. Elevar a pelve sem embalar as pernas; peso 0 se for sem carga.' },
      { exercise: 'Pallof press', target_sets: 2, target_reps: '10-12/lado', target_rest_seconds: 45, notes: 'Core B. Na polia, resistindo à rotação do tronco' },
    ],
  },
  {
    name: 'Inferior B',
    division: 'Posteriores, glúteos, quadríceps e panturrilhas',
    notes: 'Antes: séries progressivas de Levantamento Romeno.',
    cycle_order: 4,
    items: [
      { exercise: 'Levantamento Romeno', target_sets: 3, target_reps: '8-10', target_rest_seconds: 120, notes: 'Quadril para trás, coluna neutra. Registre a carga por lado, sem a barra.' },
      { exercise: 'Leg Press', target_sets: 3, target_reps: '10-15', target_rest_seconds: 120, notes: 'Leg press 45°; quadríceps e glúteos' },
      { exercise: 'Búlgaro no Smith', target_sets: 2, target_reps: '8-12/perna', target_rest_seconds: 90, notes: 'Começar pela esquerda. Se incomodar: leg press unilateral em amplitude confortável' },
      { exercise: 'Flexora unilateral', target_sets: 2, target_reps: '12-15/perna', target_rest_seconds: 60, notes: 'Execução simétrica' },
      { exercise: 'Panturrilha sentada unilateral', target_sets: 3, target_reps: '12-20/perna', target_rest_seconds: 60, notes: 'Ênfase no sóleo' },
    ],
  },
];
