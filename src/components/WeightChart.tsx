import { type LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';
import { radius } from '@/theme';
import { spacing } from '@/theme';

/**
 * WeightChart — gráfico de evolução de peso corporal.
 *
 * Linha simples conectando as pesagens ao longo do tempo, com pontos em cada
 * medição. Desenhado SÓ com Views (sem react-native-svg nem libs de chart)
 * pra funcionar igual em web (PWA) e nativo.
 *
 * A área de plotagem é absoluta dentro de um container relativo. Cada ponto
 * tem posição (x%, y%) calculada a partir dos dados; os segmentos de reta que
 * conectam pontos são Views rotacionadas.
 *
 * Visual:
 *   • Linha verde conectando os pontos
 *   • Bolinha em cada pesagem
 *   • Labels de peso (mín/máx) à esquerda do eixo Y
 *   • Primeira e última data no eixo X
 *   • Linha tracejada horizontal se `targetWeight` for passada
 *
 * Se houver menos de 2 entradas, mostra um placeholder com instruções.
 *
 * Exemplo:
 *   <WeightChart entries={[{date:'2026-07-14', weight_kg:78.5}, ...]} />
 */
interface WeightChartProps {
  entries: Array<{
    date: string; // "2026-07-14"
    weight_kg: number; // 78.5
  }>;
  /** Peso-alvo: desenha uma linha tracejada horizontal mais clara. */
  targetWeight?: number | null;
  /** Largura total do componente. Default 300. */
  width?: number;
  /** Altura total do componente. Default 150. */
  height?: number;
}

// Dimensões internas do canvas de plotagem.
const PLOT_PADDING_X = 28; // espaço pros labels de peso no eixo Y
const PLOT_PADDING_TOP = 10;
const PLOT_PADDING_BOTTOM = 18; // espaço pros labels de data no eixo X
const DOT_RADIUS = 4;
const LINE_STROKE = 2;

export function WeightChart({
  entries,
  targetWeight = null,
  width = 300,
  height = 150,
}: WeightChartProps) {
  const plotW = Math.max(0, width - PLOT_PADDING_X);
  const plotH = Math.max(
    0,
    height - PLOT_PADDING_TOP - PLOT_PADDING_BOTTOM,
  );

  // ----- Caso: menos de 2 entradas -> placeholder -----
  if (!entries || entries.length < 2) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Text style={styles.emptyText}>
          Registre pelo menos 2 pesagens
        </Text>
      </View>
    );
  }

  // ----- Normaliza/calcule limites do eixo Y -----
  const weights = entries.map((e) => e.weight_kg);
  let dataMin = Math.min(...weights);
  let dataMax = Math.max(...weights);

  // Inclui o alvo no range pra que a linha tracejada fique visível dentro do plot.
  if (typeof targetWeight === 'number' && Number.isFinite(targetWeight)) {
    dataMin = Math.min(dataMin, targetWeight);
    dataMax = Math.max(dataMax, targetWeight);
  }

  // Padding vertical pra linha não colar nas bordas. Se min === max (peso
  // constante), cria um intervalo artificial em torno do valor.
  let span = dataMax - dataMin;
  if (span === 0) {
    const pad = Math.max(1, Math.abs(dataMin) * 0.05);
    dataMin -= pad;
    dataMax += pad;
    span = dataMax - dataMin;
  } else {
    const pad = span * 0.12;
    dataMin -= pad;
    dataMax += pad;
    span = dataMax - dataMin;
  }

  const yFor = (w: number) =>
    PLOT_PADDING_TOP + ((dataMax - w) / span) * plotH;

  // ----- Posições X (igualmente espaçadas) -----
  const n = entries.length;
  const xFor = (i: number) =>
    n === 1 ? plotW / 2 : (i / (n - 1)) * plotW;

  const points = entries.map((e, i) => ({
    x: PLOT_PADDING_X + xFor(i),
    y: yFor(e.weight_kg),
    date: e.date,
    weight: e.weight_kg,
  }));

  // ----- Segmentos de reta entre pontos consecutivos -----
  // Cada segmento é uma View rotacionada. Comprimento = distância euclidiana;
  // ângulo = atan2(dy, dx). Originamos no ponto A e transladamos com left/top.
  type Segment = {
    left: number;
    top: number;
    width: number;
    rotate: number;
  };
  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    // atan2 em graus. Compensamos metade da espessura da linha no offset pra
    // alinhar o centro do traço com o centro dos pontos.
    const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
    segments.push({
      left: a.x,
      top: a.y,
      width: len,
      rotate: angleDeg,
    });
  }

  // ----- Linha de alvo (tracejada) -----
  const hasTarget =
    typeof targetWeight === 'number' &&
    Number.isFinite(targetWeight) &&
    targetWeight >= dataMin &&
    targetWeight <= dataMax;

  const targetY = hasTarget ? yFor(targetWeight as number) : 0;

  const minLabel = formatWeight(dataMin);
  const maxLabel = formatWeight(dataMax);
  const firstDate = formatDate(points[0].date);
  const lastDate = formatDate(points[points.length - 1].date);

  return (
    <View
      style={[styles.root, { width, height }]}
      onLayout={noopLayout}
    >
      {/* Labels do eixo Y: máximo (topo) e mínimo (base) */}
      <Text
        style={[styles.axisLabel, { top: PLOT_PADDING_TOP - 7 }]}
      >
        {maxLabel}
      </Text>
      <Text
        style={[
          styles.axisLabel,
          { top: PLOT_PADDING_TOP + plotH - 7 },
        ]}
      >
        {minLabel}
      </Text>

      {/* Container de plotagem (absoluto dentro do root) */}
      <View
        style={{
          position: 'absolute',
          left: PLOT_PADDING_X,
          top: 0,
          width: plotW,
          height,
        }}
      >
        {/* Linha de alvo — tracejada via borda pontilhada */}
        {hasTarget ? (
          <View
            style={[
              styles.targetLine,
              {
                top: targetY,
                width: plotW,
              },
            ]}
          />
        ) : null}

        {/* Segmentos da linha de peso */}
        {segments.map((s, idx) => (
          <View
            key={`seg-${idx}`}
            style={[
              styles.segment,
              {
                left: 0,
                top: s.top,
                width: s.width,
                transform: [
                  { rotate: `${s.rotate}deg` },
                  { translateY: -(LINE_STROKE / 2) },
                ],
              },
            ]}
          />
        ))}

        {/* Pontos */}
        {points.map((p, idx) => (
          <View
            key={`dot-${idx}`}
            style={[
              styles.dot,
              {
                left: p.x - DOT_RADIUS,
                top: p.y - DOT_RADIUS,
              },
            ]}
          />
        ))}
      </View>

      {/* Labels do eixo X: primeira e última data */}
      <Text
        style={[
          styles.axisLabel,
          {
            bottom: 2,
            left: PLOT_PADDING_X,
          },
        ]}
      >
        {firstDate}
      </Text>
      <Text
        style={[
          styles.axisLabel,
          {
            bottom: 2,
            right: 0,
          },
        ]}
      >
        {lastDate}
      </Text>
    </View>
  );
}

/** Placeholder: callback vazio pra satisfazer tipo de onLayout sem warning. */
function noopLayout(_e: LayoutChangeEvent) {
  // noop
}

/** Formata peso pra label curta: 78.5 -> "78.5", 78.0 -> "78". */
function formatWeight(kg: number): string {
  if (!Number.isFinite(kg)) return '';
  // Arredonda pra 1 casa; remove ".0" pra label ficar compacta.
  const rounded = Math.round(kg * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

/** Formata "2026-07-14" -> "14/07". */
function formatDate(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) return iso;
  const [, mm, dd] = parts;
  return `${dd}/${mm}`;
}

const styles = StyleSheet.create({
  root: {
    backgroundColor: colors.background.base,
    borderRadius: radius.lg,
    position: 'relative',
    overflow: 'hidden',
  },
  empty: {
    backgroundColor: colors.background.base,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  emptyText: {
    color: colors.text.muted,
    fontSize: 13,
    textAlign: 'center',
  },
  axisLabel: {
    position: 'absolute',
    color: colors.text.muted,
    fontSize: 10,
    // RN não tem lineHeight estável cross-plataforma; mantemos simples.
  },
  // Segmento de reta: View fina e longa, rotacionada via transform.
  // transformOrigin não é cross-plataforma no RN antigo, então alinhamos
  // o pivot no topo-esquerda e compensamos a espessura com translateY.
  segment: {
    position: 'absolute',
    height: LINE_STROKE,
    backgroundColor: colors.accent.base,
    // Garante que o traço não desenrole antialiasing fraco nas pontas:
    borderRadius: LINE_STROKE,
  },
  dot: {
    position: 'absolute',
    width: DOT_RADIUS * 2,
    height: DOT_RADIUS * 2,
    borderRadius: DOT_RADIUS,
    backgroundColor: colors.accent.base,
    borderWidth: 0,
  },
  targetLine: {
    position: 'absolute',
    height: 0,
    // Tracejado via borda pontilhada (funciona em web e nativo).
    borderStyle: 'dashed',
    borderColor: 'rgba(180, 255, 57, 0.4)',
    borderWidth: 0,
    borderBottomWidth: 1,
  },
});
