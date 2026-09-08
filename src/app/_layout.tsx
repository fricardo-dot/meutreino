import { Stack } from 'expo-router';

import { DatabaseErrorView } from '@/components/DatabaseErrorView';
import { DatabaseProvider, useDatabase } from '@/hooks/useDatabase';
import { colors } from '@/theme';

/**
 * Layout raiz.
 *
 * O DatabaseProvider envolve todo o app, inicializando o SQLite UMA vez na
 * abertura. As telas usam `useDatabase()` para acessar o status.
 *
 * IMPORTANTE: o app.json NÃO deve conter plugins que quebram o runtime no
 * Expo Go (splash-screen custom, sqlite plugin). Mantemos o JSON limpo.
 */
export default function RootLayout() {
  return (
    <DatabaseProvider>
      <RootNavigator />
    </DatabaseProvider>
  );
}

/**
 * Decide o que renderizar conforme o estado do banco.
 *
 * Precisa ser um componente separado porque `useDatabase()` só funciona
 * DENTRO do `DatabaseProvider` — no RootLayout ainda estaríamos por fora.
 *
 * Se a inicialização falhar, mostra a tela de erro com o botão de tentar de
 * novo, em vez de deixar as telas renderizarem com o banco nulo. É o que o
 * `client.ts` promete ao lançar `DatabaseInitError` com mensagem descritiva.
 *
 * O estado 'loading' NÃO é interceptado aqui: cada tela já tem seu próprio
 * indicador, e uma tela cheia de "preparando…" a cada abertura seria mais
 * intrusiva que o comportamento atual.
 */
function RootNavigator() {
  const { status, error, retry } = useDatabase();

  if (status === 'error' && error) {
    return <DatabaseErrorView error={error} onRetry={retry} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background.base },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="treino/[id]" />
      <Stack.Screen name="registrar/[id]" />
      <Stack.Screen name="historico" />
    </Stack>
  );
}
