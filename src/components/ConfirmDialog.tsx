import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';
import { radius } from '@/theme';

/**
 * Dialog de confirmação customizado — substitui o Alert.alert.
 *
 * Motivo: o Alert.alert do react-native-web não funciona confiavelmente em
 * PWAs no Safari iOS. Este modal customizado sempre funciona.
 */
interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
  /**
   * Ação confirmada. Pode ser assíncrona: enquanto a promise não resolve, os
   * dois botões ficam desabilitados, o que impede o toque duplo disparar a
   * operação duas vezes.
   *
   * Quem chama continua responsável por tratar o próprio erro e mostrar
   * mensagem — o diálogo só garante que não haja disparo duplicado nem
   * rejeição solta.
   */
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [executando, setExecutando] = useState(false);

  // Se o diálogo fecha (por sucesso ou por cancelamento), o bloqueio some.
  useEffect(() => {
    if (!visible) setExecutando(false);
  }, [visible]);

  async function confirmar() {
    if (executando) return;
    setExecutando(true);
    try {
      await onConfirm();
    } catch (error) {
      // Quem chama trata e exibe. Aqui só evitamos uma rejeição sem dono, que
      // no PWA some no console e não vira nada na tela.
      console.error('[ConfirmDialog] ação confirmada falhou:', error);
    } finally {
      setExecutando(false);
    }
  }

  const cancelar = executando ? () => {} : onCancel;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={cancelar}>
      <Pressable style={styles.overlay} onPress={cancelar}>
        <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              style={[styles.cancelBtn, executando && styles.btnDesabilitado]}
              onPress={cancelar}
              disabled={executando}
            >
              <Text style={styles.cancelText}>{cancelText}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.confirmBtn,
                destructive ? styles.confirmBtnDestructive : styles.confirmBtnNormal,
                executando && styles.btnDesabilitado,
              ]}
              onPress={confirmar}
              disabled={executando}
            >
              <Text
                style={[
                  styles.confirmText,
                  destructive ? styles.confirmTextDestructive : styles.confirmTextNormal,
                ]}
              >
                {executando ? 'Aguarde…' : confirmText}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: colors.background.elevated,
    borderRadius: radius.xl,
    padding: 20,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: colors.background.border,
  },
  title: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  message: {
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    backgroundColor: colors.background.surface,
    borderWidth: 1,
    borderColor: colors.background.border,
  },
  cancelText: {
    color: colors.text.secondary,
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: radius.md,
  },
  confirmBtnNormal: {
    backgroundColor: colors.accent.base,
  },
  confirmBtnDestructive: {
    backgroundColor: colors.status.danger,
  },
  btnDesabilitado: {
    opacity: 0.5,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '700',
  },
  /**
   * Botão lima: texto escuro (16,19:1). Branco sobre o lima daria 1,21:1 —
   * ilegível. É também a convenção de todo botão de fundo accent do app.
   */
  confirmTextNormal: {
    color: colors.background.base,
  },
  /** Botão vermelho: branco (3,76:1), o padrão usual para ação destrutiva. */
  confirmTextDestructive: {
    color: colors.text.onFilled,
  },
});
