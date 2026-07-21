import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';

import type { SessionRow } from '@/types/db';
import { useDatabase } from './useDatabase';
import { sessionsRepository } from '@/repositories/sessions.repository';

/**
 * Detecta se há uma sessão em andamento (status = 'em_andamento').
 *
 * Atualiza:
 *  - na montagem;
 *  - quando a tela volta ao foco (ex.: voltar de registrar/[id]).
 *
 * Usado pela tela Início para mostrar o banner
 * "Treino em andamento — Continuar? / Descartar".
 */
export function useActiveSession() {
  const { db, status } = useDatabase();
  const [activeSession, setActiveSession] = useState<SessionRow | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (status !== 'ready' || !db) return;
    const session = await sessionsRepository.getActiveSession(db);
    setActiveSession(session);
    setLoading(false);
  }, [db, status]);

  useEffect(() => {
    void load();
  }, [load]);

  // Recarrega quando a tela volta ao foco.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { activeSession, loading, reload: load };
}
