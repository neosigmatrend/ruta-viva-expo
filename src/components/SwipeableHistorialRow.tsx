import { useEffect, useRef, type ReactNode } from 'react'
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { colors } from '../theme'

const ACTION_W = 72
const OPEN_THRESHOLD = 40

type Props = {
  children: ReactNode
  /** Desactiva el gesto (p. ej. modo selección múltiple). */
  disabled?: boolean
  /** Solo una fila abierta a la vez: id de la abierta, o null. */
  openId: string | null
  rowId: string
  onOpenChange: (id: string | null) => void
  onDeletePress: () => void
}

/**
 * Deslizar a la izquierda revela un basurero; al tocarlo se dispara onDeletePress.
 * No borra al soltar: hay que pinchar el icono.
 */
export function SwipeableHistorialRow({
  children,
  disabled,
  openId,
  rowId,
  onOpenChange,
  onDeletePress,
}: Props) {
  const tx = useRef(new Animated.Value(0)).current
  const openRef = useRef(false)

  const snapTo = (open: boolean) => {
    openRef.current = open
    Animated.spring(tx, {
      toValue: open ? -ACTION_W : 0,
      useNativeDriver: true,
      bounciness: 0,
      speed: 28,
    }).start()
    onOpenChange(open ? rowId : null)
  }

  // Cerrar si otra fila se abrió, o si se desactiva el gesto.
  useEffect(() => {
    if (disabled || (openId !== null && openId !== rowId)) {
      if (openRef.current) {
        openRef.current = false
        Animated.spring(tx, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
          speed: 28,
        }).start()
      }
    }
  }, [disabled, openId, rowId, tx])

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => {
        if (disabled) return false
        const horizontal = Math.abs(g.dx) > 8 && Math.abs(g.dx) > Math.abs(g.dy) * 1.2
        return horizontal
      },
      onPanResponderGrant: () => {
        tx.stopAnimation()
      },
      onPanResponderMove: (_, g) => {
        // Solo hacia la izquierda; al abrir, permitir volver a 0.
        const base = openRef.current ? -ACTION_W : 0
        const next = Math.min(0, Math.max(-ACTION_W, base + g.dx))
        tx.setValue(next)
      },
      onPanResponderRelease: (_, g) => {
        const base = openRef.current ? -ACTION_W : 0
        const next = Math.min(0, Math.max(-ACTION_W, base + g.dx))
        const shouldOpen = next < -OPEN_THRESHOLD || g.vx < -0.4
        snapTo(shouldOpen)
      },
      onPanResponderTerminate: () => {
        snapTo(openRef.current)
      },
    }),
  ).current

  return (
    <View style={styles.wrap}>
      <View style={styles.actions}>
        <Pressable
          style={styles.trashBtn}
          onPress={onDeletePress}
          accessibilityLabel="Borrar ruta"
          accessibilityRole="button"
        >
          <Text style={styles.trashGlyph}>⌫</Text>
          <Text style={styles.trashLabel}>Borrar</Text>
        </Pressable>
      </View>
      <Animated.View
        style={[styles.front, { transform: [{ translateX: tx }] }]}
        {...(disabled ? {} : pan.panHandlers)}
      >
        {children}
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 8,
    borderRadius: 12,
    overflow: 'hidden',
  },
  actions: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  trashBtn: {
    width: ACTION_W,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trashGlyph: {
    color: '#fff8f2',
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  trashLabel: {
    color: '#fff8f2',
    fontSize: 11,
    fontWeight: '800',
    marginTop: 2,
  },
  front: {
    backgroundColor: colors.bg,
  },
})
