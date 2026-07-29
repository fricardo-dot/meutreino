import type { AppDatabase } from '@/types/app-database';

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

/**
 * Gera o relatório em Markdown.
 *
 * @param weekStart Início do período (segunda-feira).
 * @param weeks Número de semanas a incluir (default 1).
 */
export async function generateWeeklyReport(
  db: AppDatabase,
  weekStart: Date,
  weeks = 1,
): Promise<string> {
  const fromISO = toISODate(weekStart) + ' 00:00:00';
  const endDate = new Date(weekStart);
  endDate.setDate(endDate.getDate() + 7 * weeks);
  const toISO = toISODate(endDate) + ' 00:00:00';

  const data = await fetchReportData(db, fromISO, toISO);

  const lines: string[] = [];

  // Cabeçalho
  lines.push(`# 📋 Relatório de Treinos — ${formatDate(fromISO.slice(0, 10))} a ${formatDate(toISODate(new Date(endDate.getTime() - 86400000)))}`);
  lines.push('');
  lines.push(`**Treinos realizados:** ${data.sessions.length}`);
  lines.push('');

  if (data.sessions.length === 0) {
    lines.push('_Nenhum treino registrado neste período._');
    return lines.join('\n');
  }

  // Estatísticas gerais
  let totalSets = 0;
  let totalVolume = 0;
  let totalDuration = 0;
  const muscleVolume: Record<string, number> = {};
  const muscleSets: Record<string, number> = {};

  for (const session of data.sessions) {
    for (const ex of session.exercises) {
      const vol = exerciseVolume(ex.sets);
      totalVolume += vol;
      totalSets += ex.sets.length;
      muscleVolume[ex.muscle_group] = (muscleVolume[ex.muscle_group] ?? 0) + vol;
      muscleSets[ex.muscle_group] = (muscleSets[ex.muscle_group] ?? 0) + ex.sets.length;
    }
    totalDuration += session.duration_seconds ?? 0;
  }

  lines.push('## 📊 Resumo da semana');
  lines.push('');
  lines.push(`| Métrica | Valor |`);
  lines.push(`|---------|-------|`);
  lines.push(`| Treinos | ${data.sessions.length} |`);
  lines.push(`| Total de séries | ${totalSets} |`);
  lines.push(`| Volume total | ${Math.round(totalVolume)} kg |`);
  lines.push(`| Tempo total | ${formatDuration(totalDuration)} |`);
  lines.push('');

  // Volume por grupo muscular
  lines.push('### Volume por grupo muscular');
  lines.push('');
  lines.push(`| Grupo | Séries | Volume (kg) |`);
  lines.push(`|-------|--------|-------------|`);
  for (const [group, vol] of Object.entries(muscleVolume).sort((a, b) => b[1] - a[1])) {
    lines.push(`| ${capitalize(group)} | ${muscleSets[group]} | ${Math.round(vol)} |`);
  }
  lines.push('');

  // Detalhe de cada treino
  lines.push('---');
  lines.push('');
  lines.push('## 🏋️ Detalhes dos treinos');
  lines.push('');

  for (const session of data.sessions) {
    const dateStr = formatDate(session.started_at);
    lines.push(`### ${session.session_name} — ${dateStr}`);
    lines.push(`⏱️ Duração: ${formatDuration(session.duration_seconds)} · ${session.exercises.length} exercícios`);
    lines.push('');

    for (const ex of session.exercises) {
      const vol = exerciseVolume(ex.sets);
      const setsStr = ex.sets
        .map((s) => {
          const rir = s.rir !== null ? ` (RIR ${s.rir})` : '';
          return `${s.weight}kg × ${s.reps}${rir}`;
        })
        .join(' · ');

      const equip = ex.equipment ? ` [${ex.equipment}]` : '';
      lines.push(`- **${ex.exercise_name}**${equip} — ${ex.muscle_group}`);
      lines.push(`  - ${ex.sets.length} séries: ${setsStr}`);
      lines.push(`  - Volume: ${Math.round(vol)} kg`);
      lines.push('');
    }

    lines.push('---');
    lines.push('');
  }

  // Rodapé
  lines.push('_Relatório gerado pelo MeuTreino_');
  lines.push(`_Período: ${formatDate(fromISO.slice(0, 10))} — ${formatDate(toISODate(new Date(endDate.getTime() - 86400000)))}_`);

  return lines.join('\n');
}

// ── Helpers ───────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
