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
import { useFocusEffect } from '../lib/useFocusEffect'
import { sentidoDeRuta, type Ruta } from '../models/types'
import {
  deleteRutas,
  getRutaActiva,
  limpiarRutasPendientes,
  listRutas,
} from '../lib/storage'
import { formatCLP, formatDuration, formatFechaCorta } from '../lib/geo'
import { colors } from '../theme'
import { SwipeableHistorialRow } from '../components/SwipeableHistorialRow'

type Props = {
  onNueva: () => void
  onContinuar: (id: string) => void
  onResumen: (id: string) => void
  onMapaMacro: (ids: string[]) => void
}

export function HomeScreen({
  onNueva,
  onContinuar,
  onResumen,
  onMapaMacro,
}: Props) {
  const [activa, setActiva] = useState<Ruta | null>(null)
  const [historial, setHistorial] = useState<Ruta[]>([])
  const [seleccionando, setSeleccionando] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [borrando, setBorrando] = useState(false)
  /** Fila del historial con swipe abierto (basurero visible). */
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null)

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
      setSwipeOpenId(null)
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
    setSwipeOpenId(null)
  }

  const confirmarBorrarUna = (id: string, nombre: string) => {
    Alert.alert('Borrar ruta', `¿Borrar «${nombre}» del historial?`, [
      {
        text: 'Cancelar',
        style: 'cancel',
        onPress: () => setSwipeOpenId(null),
      },
      {
        text: 'Borrar',
        style: 'destructive',
        onPress: () => void borrarUna(id),
      },
    ])
  }

  const borrarUna = async (id: string) => {
    setBorrando(true)
    try {
      await deleteRutas([id])
      setSwipeOpenId(null)
      await load()
    } finally {
      setBorrando(false)
    }
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

  const limpiarPendiente = async (modo: 'descartar' | 'finalizar') => {
    // UI al toque: la tarjeta no debe quedarse colgada si falla el disco.
    setActiva(null)
    try {
      await limpiarRutasPendientes(modo)
      const queda = await getRutaActiva()
      if (queda) {
        // Segundo intento más agresivo: borrar todas las pendientes.
        await limpiarRutasPendientes('descartar')
      }
      await load()
      const still = await getRutaActiva()
      if (still) {
        setActiva(null)
        Alert.alert(
          'No se pudo limpiar',
          'Probá cerrar Expo Go del todo y volver a abrir. Si sigue, borramos el almacenamiento.',
        )
      }
    } catch (e) {
      setActiva(null)
      Alert.alert(
        'Error',
        e instanceof Error ? e.message : 'No se pudo limpiar la pendiente',
      )
      await load()
    }
  }

  return (
    <View style={styles.page}>
      <Text style={styles.eyebrow}>Chile · moto · Expo Go</Text>
      <Text style={styles.title}>Ruta viva</Text>
      <Text style={styles.versionBadge}>VERSIÓN 1.6.6 · mapa del viaje</Text>
      <Text style={styles.lede}>Mapa por velocidad, peajes, pausas y costos.</Text>

      <Pressable
        style={[styles.btnPrimary, seleccionando && styles.btnDisabled]}
        onPress={() => {
          if (activa) {
            Alert.alert(
              'Hay una ruta pendiente',
              'Descartala o finalizala antes de armar otra.',
              [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Descartar pendiente',
                  style: 'destructive',
                  onPress: () => void limpiarPendiente('descartar'),
                },
              ],
            )
            return
          }
          onNueva()
        }}
        disabled={seleccionando}
      >
        <Text style={styles.btnPrimaryText}>Nueva ruta</Text>
      </Pressable>

      {activa && !seleccionando && (
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Ruta pendiente</Text>
          <Text style={styles.cardHint}>
            Viaje abierto (saliste de la app o pausaste). Si no la querés,
            tocá Descartar y desaparece.
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
              onPress={() =>
                Alert.alert(
                  'Descartar pendiente',
                  'Se borra y no vuelve a aparecer.',
                  [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                      text: 'Descartar',
                      style: 'destructive',
                      onPress: () => void limpiarPendiente('descartar'),
                    },
                  ],
                )
              }
            >
              <Text style={styles.btnDescartarText}>Descartar</Text>
            </Pressable>
          </View>
          <Pressable
            style={styles.linkBtn}
            onPress={() => void limpiarPendiente('finalizar')}
          >
            <Text style={styles.link}>Finalizar y guardar en historial</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.sectionRow}>
        <Text style={styles.section}>Historial</Text>
        {historial.length > 0 && (
          <Pressable
            onPress={() => {
              if (seleccionando) salirSeleccion()
              else {
                setSwipeOpenId(null)
                setSeleccionando(true)
              }
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
          <View style={styles.selActions}>
            <Pressable
              style={[styles.btnMapa, (!nSel || borrando) && styles.btnDisabled]}
              onPress={() => {
                if (!nSel) return
                onMapaMacro([...seleccion])
              }}
              disabled={!nSel || borrando}
            >
              <Text style={styles.btnMapaText}>
                {nSel ? `Mapa (${nSel})` : 'Mapa'}
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
            <SwipeableHistorialRow
              rowId={item.id}
              openId={swipeOpenId}
              onOpenChange={setSwipeOpenId}
              disabled={seleccionando || borrando}
              onDeletePress={() => confirmarBorrarUna(item.id, item.nombre)}
            >
              <Pressable
                style={[styles.row, checked && styles.rowSelected]}
                onPress={() => {
                  if (swipeOpenId === item.id) {
                    setSwipeOpenId(null)
                    return
                  }
                  if (seleccionando) toggleSel(item.id)
                  else onResumen(item.id)
                }}
                onLongPress={() => {
                  if (!seleccionando) {
                    setSwipeOpenId(null)
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
            </SwipeableHistorialRow>
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
  linkBtn: { marginTop: 10, alignItems: 'center' },
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
  selActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  btnMapa: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnMapaText: { color: '#fff8f2', fontWeight: '800', fontSize: 14 },
  btnBorrar: {
    backgroundColor: colors.danger,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  btnBorrarText: { color: '#fff8f2', fontWeight: '800', fontSize: 14 },
  row: {
    backgroundColor: colors.elev,
    borderRadius: 12,
    padding: 12,
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
