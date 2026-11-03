import { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { MOVIMENTOS } from '@/data/mobilidade';
import { colors, radius, spacing, typography } from '@/theme';

/** Largura máxima da folha, para não esticar as imagens no computador. */
const LARGURA_MAXIMA = 560;

/**
 * Botão que abre os alongamentos e a ativação previstos para o dia.
 *
 * As imagens ficam atrás de um toque, e não soltas na tela, porque o calendário
 * e o treino já são listas longas: quatro ilustrações empurrariam os exercícios
 * para longe justamente durante o treino.
 *
 * Chave sem movimento correspondente é ignorada: um backup de versão mais nova
 * pode trazer uma que este build ainda não conhece.
 */
export function GuiaMobilidade({ chaves }: { chaves: string | null }) {
  const [aberto, setAberto] = useState(false);
  const { width } = useWindowDimensions();
  // Altura calculada, e não `aspectRatio`: no web, a proporção com largura em
  // porcentagem deixava o cartão com a altura da tela inteira.
  const larguraImagem =
    Math.min(width, LARGURA_MAXIMA) - 2 * (spacing.lg + spacing.md) - 2;
  const movimentos = (chaves ?? '')
    .split(',')
    .map((chave) => MOVIMENTOS[chave.trim()])
    .filter(Boolean);

  if (movimentos.length === 0) return null;

  return (
    <>
      <Pressable style={styles.botao} onPress={() => setAberto(true)} hitSlop={4}>
        <Text style={styles.botaoTexto}>🧘 Ver alongamentos ({movimentos.length})</Text>
      </Pressable>

      <Modal
        visible={aberto}
        animationType="slide"
        transparent
        onRequestClose={() => setAberto(false)}
      >
        <Pressable style={styles.fundo} onPress={() => setAberto(false)}>
          <Pressable style={styles.folha} onPress={(e) => e.stopPropagation()}>
            <View style={styles.cabecalho}>
              <Text style={styles.titulo}>Alongamentos e ativação</Text>
              <Pressable onPress={() => setAberto(false)} hitSlop={8}>
                <Text style={styles.fechar}>Fechar</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.lista}>
              {movimentos.map((m) => (
                <View key={m.nome} style={styles.cartao}>
                  <Image
                    source={m.imagem}
                    style={[
                      styles.imagem,
                      { width: larguraImagem, height: (larguraImagem * 3) / 4 },
                    ]}
                    resizeMode="contain"
                    accessibilityLabel={`${m.nome}: ${m.como}`}
                  />
                  <Text style={styles.nome}>{m.nome}</Text>
                  <Text style={styles.foco}>{m.foco}</Text>
                  <Text style={styles.como}>{m.como}</Text>
                </View>
              ))}
              <Text style={styles.aviso}>
                Deve dar uma tensão muscular suave, nunca dor lateral no joelho.
              </Text>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  botao: { alignSelf: 'flex-start', paddingTop: spacing.sm },
  botaoTexto: { color: colors.accent.base, fontSize: 13, fontWeight: '600' },
  fundo: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.background.base },
  folha: {
    flex: 1,
    width: '100%',
    maxWidth: LARGURA_MAXIMA,
    alignSelf: 'center',
    backgroundColor: colors.background.base,
  },
  cabecalho: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: spacing['3xl'],
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  titulo: { color: colors.text.primary, fontSize: typography.size.lg, fontWeight: '600' },
  fechar: { color: colors.accent.base, fontSize: typography.size.sm, fontWeight: '600' },
  lista: { paddingHorizontal: spacing.lg, paddingBottom: spacing['3xl'] },
  cartao: {
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
    borderRadius: radius.xl,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  imagem: {
    borderRadius: radius.md,
    marginBottom: spacing.md,
  },
  nome: { color: colors.text.primary, fontSize: typography.size.md, fontWeight: '600' },
  foco: { color: colors.accent.base, fontSize: typography.size.xs, fontWeight: '600', marginTop: 2 },
  como: { color: colors.text.secondary, fontSize: 13, lineHeight: 18, marginTop: spacing.xs },
  aviso: { color: colors.text.muted, fontSize: 13, lineHeight: 18 },
});
