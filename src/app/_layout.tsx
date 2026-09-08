import { Stack } from 'expo-router';

import { DatabaseProvider } from '@/hooks/useDatabase';
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
    </DatabaseProvider>
  );
}
