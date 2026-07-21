import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '@/theme';

/**
 * Tab bar profissional com ícones vetoriais (Ionicons).
 *
 * Fundo dark alinhado ao tema, tint color verde-limão quando ativo.
 * Componente de ícone extraído pra evitar repetição.
 */

/** Nome de ícone válido para Ionicons. */
type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/** Renderiza um ícone Ionicons na aba, na cor correta (ativo/inativo). */
function TabIcon({
  name,
  color,
  size = 24,
}: {
  name: IoniconName;
  color: string;
  size?: number;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.background.base,
          borderTopColor: colors.background.border,
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 4,
        },
        tabBarActiveTintColor: colors.accent.base,
        tabBarInactiveTintColor: colors.text.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: { marginTop: 4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Calendário',
          tabBarIcon: ({ color }) => <TabIcon name="calendar" color={color} />,
        }}
      />
      <Tabs.Screen
        name="treinos"
        options={{
          title: 'Treinos',
          tabBarIcon: ({ color }) => <TabIcon name="barbell" color={color} />,
        }}
      />
      <Tabs.Screen
        name="exercicios"
        options={{
          title: 'Exercícios',
          tabBarIcon: ({ color }) => <TabIcon name="fitness" color={color} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color }) => <TabIcon name="person" color={color} />,
        }}
      />
    </Tabs>
  );
}
