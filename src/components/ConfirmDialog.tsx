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
  onConfirm: () => void;
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
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.dialog} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>{cancelText}</Text>
            </Pressable>
            <Pressable
              style={[
                styles.confirmBtn,
                destructive ? styles.confirmBtnDestructive : styles.confirmBtnNormal,
              ]}
              onPress={onConfirm}
            >
              <Text style={styles.confirmText}>{confirmText}</Text>
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
  confirmText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
