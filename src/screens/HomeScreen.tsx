import { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
} from 'react-native'
// Alert used for pending-route close options
import { useFocusEffect } from '../lib/useFocusEffect'
import { sentidoDeRuta, type Ruta } from '../models/types'
import { deleteRutas, getRutaActiva, listRutas, saveRuta } from '../lib/storage'
import { formatCLP, formatDuration, formatFechaCorta } from '../lib/geo'
import { colors } from '../theme'

type Props = {
  onNueva: () => void
  onContinuar: (id: string) => void
  onResumen: (id: string) => void
}

export function HomeScreen({ onNueva, onContinuar, onResumen }: Props) {
  const [activa, setActiva] = useState<Ruta | null>(null)
  const [historial, setHistorial] = useState<Ruta[]>([])
  const [seleccionando, setSeleccionando] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [borrando, setBorrando] = useState(false)

  const load = useCallback(async () => {
    const a = await getRutaActiva()
    const all = await listRutas()
    setActiva(a ?? null)
    setHistorial(all.filter((r) => r.estado === 'finalizada').slice(0, 40))
  }, [])

  useFocusEffect(
    useCallback(() => {
      void load()
      setSeleccionando(false)
      setSeleccion(new Set())
    }, [load]),
  )

  const nSel = seleccion.size
  const todosIds = useMemo(() => historial.map((r) => r.id), [historial])

  const toggleSel = (id: string) => {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const salirSeleccion = () => {
    setSeleccionando(false)
    setSeleccion(new Set())
  }

  const seleccionarTodo = () => {
    if (nSel === historial.length) setSeleccion(new Set())
    else setSeleccion(new Set(todosIds))
  }

  const confirmarBorrar = () => {
    if (!nSel) return
    Alert.alert(
      'Borrar historial',
      nSel === 1
        ? '¿Borrar esta ruta del historial?'
        : `¿Borrar ${nSel} rutas del historial?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: () => void borrarSeleccionadas(),
        },
      ],
    )
  }

  const borrarSeleccionadas = async () => {
    setBorrando(true)
    try {
      await deleteRutas([...seleccion])
      salirSeleccion()
      await load()
    } finally {
      setBorrando(false)
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.eyebrow}>Chile · moto · Expo Go</Text>
      <Text style={styles.title}>Ruta viva</Text>
      <Text style={styles.versionBadge}>VERSIÓN 1.6.1 · ruta pendiente</Text>
      <Text style={styles.lede}>Mapa por velocidad, peajes, pausas y costos.</Text>

      <Pressable
        style={[styles.btnPrimary, seleccionando && styles.btnDisabled]}
        onPress={onNueva}
        disabled={seleccionando}
      >
        <Text style={styles.btnPrimaryText}>Nueva ruta</Text>
      </Pressable>

      {activa && !seleccionando && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Ruta pendiente</Text>
          <Text style={styles.cardHint}>
            Si salís de la app, acá la retomás. Tocá Continuar o descartala.
          </Text>
          <View style={styles.rowTop}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {activa.nombre}
            </Text>
            <SentidoBadge sentido={sentidoDeRuta(activa)} />
          </View>
          <Text style={styles.muted}>
            {activa.estado === 'pausada' ? 'Pausada' : 'En curso'} ·{' '}
            {formatCLP(activa.costos.total)}
          </Text>
          <View style={styles.pendienteActions}>
            <Pressable
              style={styles.btnContinuar}
              onPress={() => onContinuar(activa.id)}
            >
              <Text style={styles.btnContinuarText}>Continuar</Text>
            </Pressable>
            <Pressable
              style={styles.btnDescartar}
              onPress={() => {
                Alert.alert(
                  'Ruta pendiente',
                  '¿Finalizar y guardar en historial, o descartar?',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Finalizar',
                      onPress: () =>
                        void (async () => {
                          await saveRuta({
                            ...activa,
                            estado: 'finalizada',
                            finalizadaEn: new Date().toISOString(),
                          })
                          await load()
                        })(),
                    },
                    {
                      text: 'Descartar',
                      style: 'destructive',
                      onPress: () =>
                        void (async () => {
                          await deleteRutas([activa.id])
                          await load()
                        })(),
                    },
                  ],
                )
              }}
            >
              <Text style={styles.btnDescartarText}>Cerrar…</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.sectionRow}>
        <Text style={styles.section}>Historial</Text>
        {historial.length > 0 && (
          <Pressable
            onPress={() => {
              if (seleccionando) salirSeleccion()
              else setSeleccionando(true)
            }}
          >
            <Text style={styles.link}>
              {seleccionando ? 'Cancelar' : 'Seleccionar'}
            </Text>
          </Pressable>
        )}
      </View>
      <Text style={styles.legend}>
        <Text style={{ color: colors.ida }}>↑ verde Ida</Text>
        {'  ·  '}
        <Text style={{ color: colors.vuelta }}>↓ azul Vuelta</Text>
      </Text>

      {seleccionando && historial.length > 0 && (
        <View style={styles.selBar}>
          <Pressable onPress={seleccionarTodo}>
            <Text style={styles.link}>
              {nSel === historial.length ? 'Ninguna' : 'Todas'}
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.btnBorrar,
              (!nSel || borrando) && styles.btnDisabled,
            ]}
            onPress={confirmarBorrar}
            disabled={!nSel || borrando}
          >
            <Text style={styles.btnBorrarText}>
              {borrando
                ? 'Borrando…'
                : nSel
                  ? `Borrar (${nSel})`
                  : 'Borrar'}
            </Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={historial}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={load}
            enabled={!seleccionando}
          />
        }
        ListEmptyComponent={
          <Text style={styles.muted}>Sin rutas finalizadas.</Text>
        }
        renderItem={({ item }) => {
          const sentido = sentidoDeRuta(item)
          const esIda = sentido === 'ida'
          const fechaColor = esIda ? colors.ida : colors.vuelta
          const flecha = esIda ? '↑' : '↓'
          const fecha = formatFechaCorta(item.finalizadaEn || item.creadaEn)
          const checked = seleccion.has(item.id)
          return (
            <Pressable
              style={[styles.row, checked && styles.rowSelected]}
              onPress={() => {
                if (seleccionando) toggleSel(item.id)
                else onResumen(item.id)
              }}
              onLongPress={() => {
                if (!seleccionando) {
                  setSeleccionando(true)
                  setSeleccion(new Set([item.id]))
                }
              }}
            >
              <View style={styles.rowTop}>
                {seleccionando && (
                  <Text style={styles.check}>{checked ? '☑' : '☐'}</Text>
                )}
                <Text
                  style={[styles.fecha, { color: fechaColor, flex: 1 }]}
                >
                  {flecha} {fecha}
                </Text>
                <Text style={[styles.sentidoTag, { color: fechaColor }]}>
                  {esIda ? 'IDA' : 'VUELTA'}
                </Text>
              </View>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.nombre}
              </Text>
              <Text style={styles.muted}>
                {formatDuration(item.tiempos.totalSeg)} ·{' '}
                {formatCLP(item.costos.total)}
              </Text>
            </Pressable>
          )
        }}
      />
    </View>
  )
}

function SentidoBadge({ sentido }: { sentido: 'ida' | 'vuelta' }) {
  const esIda = sentido === 'ida'
  return (
    <Text
      style={[styles.badge, { color: esIda ? colors.ida : colors.vuelta }]}
    >
      {esIda ? '↑ IDA' : '↓ VUELTA'}
    </Text>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 56 },
  eyebrow: {
    color: colors.accent2,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 11,
  },
  title: { color: colors.ink, fontSize: 36, fontWeight: '700', marginTop: 4 },
  versionBadge: {
    marginTop: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
    backgroundColor: colors.accent,
    color: '#fff8f2',
    fontWeight: '800',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: 'hidden',
  },
  lede: { color: colors.muted, marginTop: 6, marginBottom: 20, maxWidth: 280 },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 14,
  },
  btnPrimaryText: { color: '#fff8f2', fontWeight: '700', fontSize: 17 },
  btnDisabled: { opacity: 0.45 },
  card: {
    backgroundColor: colors.elev,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 18,
  },
  cardLabel: {
    color: colors.accent2,
    fontSize: 11,
    textTransform: 'uppercase',
  },
  cardHint: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 6,
  },
  cardTitle: {
    color: colors.ink,
    fontWeight: '600',
    fontSize: 16,
    marginTop: 2,
    flex: 1,
  },
  muted: { color: colors.muted, marginTop: 2 },
  pendienteActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  btnContinuar: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  btnContinuarText: { color: '#fff8f2', fontWeight: '700' },
  btnDescartar: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDescartarText: { color: colors.muted, fontWeight: '600' },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  section: { color: colors.ink, fontWeight: '600' },
  link: { color: colors.accent2, fontWeight: '700', fontSize: 14 },
  legend: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  selBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 12,
  },
  btnBorrar: {
    backgroundColor: colors.danger,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  btnBorrarText: { color: '#fff8f2', fontWeight: '800', fontSize: 14 },
  row: {
    backgroundColor: colors.elev,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowSelected: {
    borderColor: colors.danger,
    backgroundColor: 'rgba(217,107,92,0.12)',
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  check: {
    color: colors.ink,
    fontSize: 18,
    width: 26,
  },
  fecha: {
    fontWeight: '800',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  sentidoTag: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
  },
  badge: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 0.5,
  },
})
