import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

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
 * Tenta vibrar no fim do descanso. No web, tenta Notification API ou ignora.
 * Nunca lança erro (envolve em try/catch).
 */
function notifyRestEnd() {
  try {
    // Nativo (iOS/Android)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      (navigator as Navigator & { vibrate: (p: number | number[]) => boolean }).vibrate(200);
    }
  } catch {
    // Ignora — vibração é opcional.
  }
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
  const finishedRef = useRef(false);

  const computeRemaining = useCallback(() => {
    if (restEndsAt === null) {
      setRemaining(0);
      return;
    }
    const ms = restEndsAt - Date.now();
    const secs = Math.max(0, Math.ceil(ms / 1000));
    setRemaining(secs);

    // Detecta fim APENAS aqui (não em effect) pra evitar race condition.
    if (secs === 0 && !finishedRef.current) {
      finishedRef.current = true;
      notifyRestEnd();
      setRestEndsAt(null);
    }
  }, [restEndsAt]);

  // Tick a cada segundo.
  useEffect(() => {
    if (restEndsAt === null) return;
    finishedRef.current = false;
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

  const start = useCallback((endsAt: number) => {
    finishedRef.current = false;
    setRestEndsAt(endsAt);
  }, []);

  const cancel = useCallback(() => {
    finishedRef.current = true;
    setRestEndsAt(null);
    setRemaining(0);
  }, []);

  return {
    restEndsAt,
    remaining,
    isActive: restEndsAt !== null && remaining > 0,
    start,
    cancel,
  };
}
