import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '@/theme';
import { radius } from '@/theme';

/**
 * StepperInput — input numérico com botões +/− grandes.
 *
 * Pensado pra registro rápido de séries na academia: o usuário ajusta o valor
 * com toques grandes (sem precisar digitar), mas também pode tocar no número
 * pra editar manualmente.
 *
 * Suporta decimais (peso) ou inteiros (reps, RIR), com incremento
 * configurável e clamp opcional.
 *
 * Exemplo visual:
 *   ┌───────────────────┐
 *   │  −   80.0 kg   +  │
 *   └───────────────────┘
 */
interface StepperInputProps {
  /** Label acima do campo (ex: "PESO", "REPS"). */
  label: string;
  /** Sufixo mostrado depois do número (ex: "kg", ""). */
  suffix?: string;
  /** Valor atual como string (controlado pelo parent). */
  value: string;
  onChange: (value: string) => void;
  /** Incremento/decremento ao tocar +/−. Default 1. */
  step?: number;
  /** Casa decimais. 0 = inteiro, 1 = uma casa (ex: 80.0). Default 0. */
  decimals?: number;
  /** Valor mínimo (clamp). Default 0. */
  min?: number;
  /** Valor máximo (clamp). Opcional (ex: RIR = 3). */
  max?: number;
  /** Tipo de teclado quando o usuário toca pra digitar. */
  keyboardType?: 'decimal-pad' | 'number-pad';
  /**
   * Proporção flex do stepper na linha. Default: 1.
   * Use números maiores pra dar mais espaço (ex: peso=1.4, reps=1, rir=0.85).
   */
  flex?: number;
}

export function StepperInput({
  label,
  suffix,
  value,
  onChange,
  step = 1,
  decimals = 0,
  min = 0,
  max,
  keyboardType = 'decimal-pad',
  flex = 1,
}: StepperInputProps) {
  const [editing, setEditing] = useState(false);

  function parseCurrentValue(): number {
    const n = parseFloat(value.replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  }

  function formatNumber(n: number): string {
    if (decimals > 0) return n.toFixed(decimals);
    return String(Math.round(n));
  }

  function handleIncrement() {
    const next = parseCurrentValue() + step;
    const clamped = max !== undefined ? Math.min(max, next) : next;
    onChange(formatNumber(clamped));
  }

  function handleDecrement() {
    const next = parseCurrentValue() - step;
    const clamped = Math.max(min, next);
    onChange(formatNumber(clamped));
  }

  return (
    <View style={[styles.container, { flex }]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <StepperButton direction="minus" onPress={handleDecrement} />
        <View style={styles.valueWrap}>
          {editing ? (
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChange}
              keyboardType={keyboardType}
              autoFocus
              selectTextOnFocus
              onBlur={() => setEditing(false)}
              onSubmitEditing={() => setEditing(false)}
            />
          ) : (
            <Pressable onPress={() => setEditing(true)} hitSlop={4}>
              <Text style={styles.value}>{value}</Text>
            </Pressable>
          )}
          {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
        </View>
        <StepperButton direction="plus" onPress={handleIncrement} />
      </View>
    </View>
  );
}

/** Botão +/− reutilizável, grande e fácil de tocar. */
function StepperButton({
  direction,
  onPress,
}: {
  direction: 'plus' | 'minus';
  onPress: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      onPress={onPress}
      hitSlop={4}
    >
      <Text style={styles.btnText}>{direction === 'plus' ? '+' : '−'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  label: {
    color: colors.text.muted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background.base,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  btn: {
    width: 32,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.surface,
  },
  btnPressed: { backgroundColor: colors.background.elevated },
  btnText: {
    color: colors.accent.base,
    fontSize: 20,
    fontWeight: '300',
  },
  valueWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    paddingVertical: 9,
  },
  value: {
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: '700',
  },
  input: {
    color: colors.text.primary,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    padding: 0,
    minWidth: 40,
  },
  suffix: {
    color: colors.text.muted,
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
});
