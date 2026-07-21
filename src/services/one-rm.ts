/**
 * Cálculos de força — estimativa de 1RM (uma repetição máxima) e volume.
 *
 * Usado pelo serviço de recordes para detectar PRs e pela UI para mostrar
 * a estimativa de 1RM. A UI pode exibir o 1RM apenas em séries de ~1 a 12
 * repetições, mesmo que as funções aqui aceitem outros valores.
 */

/**
 * Estima o 1RM pela fórmula de Epley: 1RM = peso × (1 + reps / 30).
 *
 * Retorna `null` quando o cálculo não é aplicável:
 *  - peso inválido (NaN, infinito, <= 0)
 *  - reps inválido (não-inteiro, <= 0)
 *
 * Caso especial: reps === 1 → o peso usado É o 1RM, retorna direto.
 */
export function calculateEpley1RM(
  weight: number,
  reps: number,
): number | null {
  if (!Number.isFinite(weight) || !Number.isInteger(reps)) {
    return null;
  }

  if (weight <= 0 || reps <= 0) {
    return null;
  }

  if (reps === 1) {
    return weight;
  }

  return weight * (1 + reps / 30);
}

/**
 * Calcula o volume de uma série: peso × repetições.
 *
 * Retorna 0 para entradas inválidas (NaN, infinito, negativo) — nunca lança.
 */
export function calculateSetVolume(weight: number, reps: number): number {
  if (
    !Number.isFinite(weight) ||
    !Number.isInteger(reps) ||
    weight < 0 ||
    reps < 0
  ) {
    return 0;
  }

  return weight * reps;
}
