import { Stack } from 'expo-router';

import { DatabaseProvider } from '@/hooks/useDatabase';

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
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0B0B0F' },
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="treino/[id]" />
        <Stack.Screen name="registrar/[id]" />
        <Stack.Screen name="historico" />
      </Stack>
    </DatabaseProvider>
  );
}
