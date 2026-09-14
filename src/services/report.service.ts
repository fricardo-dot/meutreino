import type { AppDatabase } from '@/types/app-database';

import { calendarService, utcToLocalISODate } from './calendar.service';
import { calculateEpley1RM } from './one-rm';

/**
 * Gera um relatório em Markdown dos treinos de um período.
 *
 * Formatado pra ser enviado a uma IA (ChatGPT, Claude, etc) e receber
 * feedback sobre progressão, volume, equilíbrio muscular, etc.
 *
 * Inclui: data, nome do treino, exercícios, séries com carga/reps/RIR,
 * volume total, duração, e estatísticas resumidas.
 */

interface ReportSet {
  set_number: number;
  weight: number;
  reps: number;
  rir: number | null;
}

interface ReportExercise {
  exercise_name: string;
  muscle_group: string;
  equipment: string | null;
  sets: ReportSet[];
}

interface ReportSession {
  session_name: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  exercises: ReportExercise[];
}

/** Dados completos do período, já estruturados. */
interface ReportData {
  fromISO: string;
  toISO: string;
  sessions: ReportSession[];
}

/**
 * Busca todos os dados dos treinos num período (com séries detalhadas).
 */
async function fetchReportData(
  db: AppDatabase,
  fromISO: string,
  toISO: string,
): Promise<ReportData> {
  // 1. Busca todas as sessões concluídas no período.
  const sessions = await db.getAllAsync<{
    id: number;
    name: string;
    started_at: string;
    ended_at: string | null;
    duration_seconds: number | null;
  }>(
    `SELECT id, name, started_at, ended_at, duration_seconds
     FROM sessions
     WHERE status = 'concluida'
       AND started_at >= ?
       AND started_at < ?
     ORDER BY started_at;`,
    [fromISO, toISO],
  );

  // 2. Pra cada sessão, busca exercícios + séries.
  const result: ReportSession[] = [];

  for (const session of sessions) {
    const exercises = await db.getAllAsync<{
      id: number;
      exercise_name: string;
      muscle_group: string;
      equipment: string | null;
    }>(
      `SELECT se.id, se.exercise_name, e.muscle_group, e.equipment
       FROM session_exercises se
       JOIN exercises e ON e.id = se.exercise_id
       WHERE se.session_id = ?
       ORDER BY se.sort_order;`,
      [session.id],
    );

    const exercisesWithSets: ReportExercise[] = [];

    for (const ex of exercises) {
      const sets = await db.getAllAsync<ReportSet>(
        `SELECT set_number, weight, reps, rir
         FROM session_sets
         WHERE session_exercise_id = ?
         ORDER BY set_number;`,
        [ex.id],
      );

      exercisesWithSets.push({
        exercise_name: ex.exercise_name,
        muscle_group: ex.muscle_group,
        equipment: ex.equipment,
        sets,
      });
    }

    result.push({
      session_name: session.name,
      started_at: session.started_at,
      ended_at: session.ended_at,
      duration_seconds: session.duration_seconds,
      exercises: exercisesWithSets,
    });
  }

  return { fromISO, toISO, sessions: result };
}

/**
 * Formata segundos → "Xmin" ou "Xh Ymin".
 */
function formatDuration(seconds: number | null): string {
  if (!seconds || seconds === 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours >= 1) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

/**
 * Formata data ISO → "Seg, 28/07".
 */
function formatDate(iso: string): string {
  const d = new Date(iso.slice(0, 10) + 'T12:00:00');
  const days = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const day = days[d.getDay()];
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}, ${dd}/${mm}`;
}

/**
 * Calcula volume total de um exercício (soma peso × reps de todas as séries).
 */
function exerciseVolume(sets: ReportSet[]): number {
  return sets.reduce((acc, s) => acc + s.weight * s.reps, 0);
}

// ── Relatório do bloco inteiro ────────────────────────────────────────────

/** Uma semana do bloco, com os números agregados. */
interface SemanaDoBloco {
  numero: number;
  inicio: Date;
  treinos: number;
  series: number;
  volume: number;
  duracao: number;
}

/** A melhor série de um exercício numa semana, medida por 1RM estimado. */
interface MelhorSerie {
  semana: number;
  weight: number;
  reps: number;
  umRM: number;
}

/**
 * Gera o relatório do BLOCO em uso — não de uma semana.
 *
 * O relatório semanal responde "como foi a semana". Um programa de 6 a 8
 * semanas precisa de outra pergunta: "estou progredindo?". Semana isolada não
 * mostra progressão, que por definição é a comparação entre elas.
 *
 * O período vai da ativação do pacote até hoje. Filtrar por tempo basta para
 * pegar só os treinos deste bloco: trocar de pacote é justamente o que define
 * o começo do período, então tudo registrado depois pertence a ele.
 *
 * `activated_at` pode ser NULL num pacote vindo de backup anterior à coluna;
 * aí vale a data de criação, que é o melhor dado que resta.
 */
export async function generatePackReport(
  db: AppDatabase,
  pack: { name: string; activated_at: string | null; created_at: string },
): Promise<string> {
  const inicioUtc = pack.activated_at ?? pack.created_at;
  const inicioLocal = new Date(`${utcToLocalISODate(inicioUtc)}T12:00:00`);
  const primeiraSemana = calendarService.getWeekStart(inicioLocal);

  // Amanhã como limite superior: o SQL usa `< toISO`, e parar em "hoje"
  // deixaria de fora o treino de hoje, que é o que acabou de ser feito.
  const fim = new Date();
  fim.setDate(fim.getDate() + 1);

  const data = await fetchReportData(
    db,
    toUtcTimestamp(primeiraSemana),
    toUtcTimestamp(fim),
  );

  const semanaAtual = calendarService.getSemanaDoBloco(inicioUtc);
  const lines: string[] = [];

  lines.push(`# 📋 Relatório do bloco — ${pack.name}`);
  lines.push('');
  lines.push(
    `**Período:** ${formatDate(toISODate(primeiraSemana))} a ` +
      `${formatDate(toISODate(new Date()))} · semana ${semanaAtual} do bloco`,
  );
  lines.push(`**Treinos realizados:** ${data.sessions.length}`);
  lines.push('');

  if (data.sessions.length === 0) {
    lines.push('_Nenhum treino registrado neste bloco ainda._');
    return lines.join('\n');
  }

  // ── Agregados ───────────────────────────────────────────────────────────
  let totalSets = 0;
  let totalVolume = 0;
  let totalDuration = 0;
  const muscleVolume: Record<string, number> = {};
  const muscleSets: Record<string, number> = {};
  const semanas = new Map<number, SemanaDoBloco>();
  /** Por exercício, a melhor série de cada semana em que ele apareceu. */
  const porExercicio = new Map<string, MelhorSerie[]>();

  for (const session of data.sessions) {
    const nSemana = calendarService.getSemanaDoBloco(
      inicioUtc,
      new Date(`${utcToLocalISODate(session.started_at)}T12:00:00`),
    );
    let semana = semanas.get(nSemana);
    if (!semana) {
      const inicio = new Date(primeiraSemana);
      inicio.setDate(inicio.getDate() + 7 * (nSemana - 1));
      semana = {
        numero: nSemana,
        inicio,
        treinos: 0,
        series: 0,
        volume: 0,
        duracao: 0,
      };
      semanas.set(nSemana, semana);
    }
    semana.treinos += 1;
    semana.duracao += session.duration_seconds ?? 0;
    totalDuration += session.duration_seconds ?? 0;

    for (const ex of session.exercises) {
      const vol = exerciseVolume(ex.sets);
      totalVolume += vol;
      totalSets += ex.sets.length;
      semana.volume += vol;
      semana.series += ex.sets.length;
      muscleVolume[ex.muscle_group] = (muscleVolume[ex.muscle_group] ?? 0) + vol;
      muscleSets[ex.muscle_group] = (muscleSets[ex.muscle_group] ?? 0) + ex.sets.length;

      // A melhor série é medida pelo 1RM estimado, não pela carga: 60kg × 10
      // é mais do que 65kg × 3, e comparar só o peso esconderia isso.
      for (const set of ex.sets) {
        const umRM = calculateEpley1RM(set.weight, set.reps);
        if (umRM === null) continue;

        const lista = porExercicio.get(ex.exercise_name) ?? [];
        const daSemana = lista.find((m) => m.semana === nSemana);
        if (!daSemana) {
          lista.push({ semana: nSemana, weight: set.weight, reps: set.reps, umRM });
        } else if (umRM > daSemana.umRM) {
          daSemana.weight = set.weight;
          daSemana.reps = set.reps;
          daSemana.umRM = umRM;
        }
        porExercicio.set(ex.exercise_name, lista);
      }
    }
  }

  // ── Resumo ──────────────────────────────────────────────────────────────
  lines.push('## 📊 Resumo do bloco');
  lines.push('');
  lines.push('| Métrica | Valor |');
  lines.push('|---------|-------|');
  lines.push(`| Treinos | ${data.sessions.length} |`);
  lines.push(`| Total de séries | ${totalSets} |`);
  lines.push(`| Volume total | ${Math.round(totalVolume)} kg |`);
  lines.push(`| Tempo total | ${formatDuration(totalDuration)} |`);
  lines.push('');

  // ── Evolução semana a semana ────────────────────────────────────────────
  lines.push('## 📈 Evolução por semana');
  lines.push('');
  lines.push('| Semana | Início | Treinos | Séries | Volume (kg) | Tempo |');
  lines.push('|--------|--------|---------|--------|-------------|-------|');
  for (const semana of [...semanas.values()].sort((a, b) => a.numero - b.numero)) {
    lines.push(
      `| ${semana.numero} | ${formatDate(toISODate(semana.inicio))} | ` +
        `${semana.treinos} | ${semana.series} | ${Math.round(semana.volume)} | ` +
        `${formatDuration(semana.duracao)} |`,
    );
  }
  lines.push('');

  // ── Progressão por exercício ────────────────────────────────────────────
  lines.push('## 🏆 Progressão por exercício');
  lines.push('');
  lines.push('_Melhor série de cada semana, medida pelo 1RM estimado (Epley)._');
  lines.push('');
  lines.push('| Exercício | Primeira | Última | 1RM est. | Δ |');
  lines.push('|-----------|----------|--------|----------|---|');

  const progressao = [...porExercicio.entries()]
    .map(([nome, marcas]) => {
      const ordenadas = [...marcas].sort((a, b) => a.semana - b.semana);
      const primeira = ordenadas[0];
      const ultima = ordenadas[ordenadas.length - 1];
      return { nome, primeira, ultima, delta: ultima.umRM - primeira.umRM };
    })
    .sort((a, b) => b.delta - a.delta);

  for (const item of progressao) {
    // Exercício que apareceu numa semana só não tem progressão a mostrar —
    // fica na tabela com Δ vazio, porque sumir dela esconderia que foi feito.
    const umaSemanaSo = item.primeira.semana === item.ultima.semana;
    const delta = umaSemanaSo
      ? '—'
      : `${item.delta >= 0 ? '+' : ''}${item.delta.toFixed(1)} kg`;
    lines.push(
      `| ${item.nome} | ${item.primeira.weight}kg × ${item.primeira.reps} ` +
        `(sem ${item.primeira.semana}) | ${item.ultima.weight}kg × ` +
        `${item.ultima.reps} (sem ${item.ultima.semana}) | ` +
        `${item.primeira.umRM.toFixed(1)} → ${item.ultima.umRM.toFixed(1)} | ${delta} |`,
    );
  }
  lines.push('');

  // ── Volume por grupo muscular ───────────────────────────────────────────
  lines.push('### Volume por grupo muscular');
  lines.push('');
  lines.push('| Grupo | Séries | Volume (kg) |');
  lines.push('|-------|--------|-------------|');
  for (const [group, vol] of Object.entries(muscleVolume).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${capitalize(group)} | ${muscleSets[group]} | ${Math.round(vol)} |`);
  }
  lines.push('');

  // ── Detalhe treino a treino ─────────────────────────────────────────────
  lines.push('---');
  lines.push('');
  lines.push('## 🏋️ Detalhes dos treinos');
  lines.push('');

  for (const session of data.sessions) {
    const dateStr = formatDate(utcToLocalISODate(session.started_at));
    lines.push(`### ${session.session_name} — ${dateStr}`);
    lines.push(
      `⏱️ Duração: ${formatDuration(session.duration_seconds)} · ` +
        `${session.exercises.length} exercícios`,
    );
    lines.push('');

    for (const ex of session.exercises) {
      const setsStr = ex.sets
        .map((set) => {
          const rir = set.rir !== null ? ` (RIR ${set.rir})` : '';
          return `${set.weight}kg × ${set.reps}${rir}`;
        })
        .join(' · ');
      const equip = ex.equipment ? ` [${ex.equipment}]` : '';
      lines.push(`- **${ex.exercise_name}**${equip} — ${ex.muscle_group}`);
      lines.push(`  - ${ex.sets.length} séries: ${setsStr}`);
      lines.push(`  - Volume: ${Math.round(exerciseVolume(ex.sets))} kg`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  lines.push('_Relatório gerado pelo MeuTreino_');

  return lines.join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Converte um instante local para o timestamp UTC no formato do SQLite
 * ("YYYY-MM-DD HH:MM:SS"), que é como CURRENT_TIMESTAMP grava.
 */
function toUtcTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
