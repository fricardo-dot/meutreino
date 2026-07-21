import { useCallback, useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Haptics from 'expo-haptics';

/**
 * Estado do cronômetro de descanso.
 *
 * Baseado em timestamp (restEndsAt), NÃO em contador regressivo em memória.
 * Assim, quando o app volta do background ou da tela de bloqueio, o tempo
 * restante é recalculado — nunca fica incorreto.
 */
export interface RestTimerState {
  /** Horário (epoch ms) em que o descanso termina, ou null se sem descanso. */
  restEndsAt: number | null;
  /** Segundos restantes (atualizado a cada tick). 0 quando acabou. */
  remaining: number;
  /** True se há descanso ativo e ainda não terminou. */
  isActive: boolean;
}

/**
 * Hook que gerencia um cronômetro de descanso.
 *
 * - `start(restEndsAt)` inicia (recebe o timestamp de fim).
 * - `cancel()` interrompe.
 * - Quando chega a zero, vibra (feedback) e limpa.
 * - Recalcula `remaining` a cada segundo E quando o app volta do background.
 */
export function useRestTimer() {
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);
  const [remaining, setRemaining] = useState(0);

  const computeRemaining = useCallback(() => {
    if (restEndsAt === null) {
      setRemaining(0);
      return;
    }
    const ms = restEndsAt - Date.now();
    setRemaining(Math.max(0, Math.ceil(ms / 1000)));
  }, [restEndsAt]);

  // Tick a cada segundo.
  useEffect(() => {
    if (restEndsAt === null) return;
    computeRemaining();
    const interval = setInterval(computeRemaining, 1000);
    return () => clearInterval(interval);
  }, [restEndsAt, computeRemaining]);

  // Recalcula quando o app volta ao primeiro plano.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') computeRemaining();
    });
    return () => subscription.remove();
  }, [computeRemaining]);

  // Vibra quando o descanso termina (remaining chega a 0).
  useEffect(() => {
    if (restEndsAt !== null && remaining === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setRestEndsAt(null);
    }
  }, [remaining, restEndsAt]);

  const start = useCallback((endsAt: number) => {
    setRestEndsAt(endsAt);
  }, []);

  const cancel = useCallback(() => {
    setRestEndsAt(null);
  }, []);

  return {
    restEndsAt,
    remaining,
    isActive: restEndsAt !== null && remaining > 0,
    start,
    cancel,
  };
}
