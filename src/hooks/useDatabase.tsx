import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { AppDatabase } from '@/types/app-database';

import { ensureSeedData } from '@/db/seed';
import { DatabaseInitError, getDatabase } from '@/db/client';

/**
 * Estado de inicialização do banco, exposto pela `DatabaseProvider`.
 *
 * - `status === 'loading'` → splash/loading visível.
 * - `status === 'ready'`   → `db` disponível, app pode renderizar.
 * - `status === 'error'`   → `error` preenchido; UI mostra mensagem útil.
 */
interface DatabaseState {
  status: 'loading' | 'ready' | 'error';
  db: AppDatabase | null;
  error: Error | null;
  /** Nova tentativa de inicialização (ex.: botão "Tentar de novo"). */
  retry: () => void;
}

const DatabaseContext = createContext<DatabaseState | null>(null);

/**
 * Inicializa o banco UMA vez, na raiz do app.
 *
 * O fluxo é:
 *   getDatabase() → migrations pendentes → ensureSeedData() → ready
 *
 * Em caso de erro, o app mostra uma tela útil (ErrorBoundary/database),
 * nunca uma tela em branco.
 */
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [db, setDb] = useState<AppDatabase | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const initRef = useRef<() => void>(() => {});

  // Função de inicialização — guardada em ref para `retry` estável.
  initRef.current = async () => {
    setStatus('loading');
    setError(null);
    try {
      const database = await getDatabase();
      await ensureSeedData(database);
      setDb(database);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
      setStatus('error');
    }
  };

  // Dispara UMA vez na montagem.
  useEffect(() => {
    void initRef.current();
  }, []);

  const value: DatabaseState = {
    status,
    db,
    error,
    retry: () => void initRef.current(),
  };

  return <DatabaseContext.Provider value={value}>{children}</DatabaseContext.Provider>;
}

/**
 * Acesso ao estado do banco. Só pode ser usado dentro de `DatabaseProvider`.
 * Lança erro explícito se usado fora do provider — mais útil que undefined.
 */
export function useDatabase(): DatabaseState {
  const ctx = useContext(DatabaseContext);
  if (!ctx) {
    throw new Error('useDatabase deve ser usado dentro de <DatabaseProvider>.');
  }
  return ctx;
}
