import { useCallback, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  RefreshControl,
} from 'react-native'
import { useFocusEffect } from '../lib/useFocusEffect'
import { sentidoDeRuta, type Ruta } from '../models/types'
import { getRutaActiva, listRutas } from '../lib/storage'
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

  const load = useCallback(async () => {
    const a = await getRutaActiva()
    const all = await listRutas()
    setActiva(a ?? null)
    setHistorial(all.filter((r) => r.estado === 'finalizada').slice(0, 12))
  }, [])

  useFocusEffect(load)

  return (
    <View style={styles.page}>
      <Text style={styles.eyebrow}>Chile · moto · Expo Go</Text>
      <Text style={styles.title}>Ruta viva</Text>
      <Text style={styles.versionBadge}>VERSIÓN 1.5.9 · ida / vuelta</Text>
      <Text style={styles.lede}>Mapa por velocidad, peajes, pausas y costos.</Text>

      <Pressable style={styles.btnPrimary} onPress={onNueva}>
        <Text style={styles.btnPrimaryText}>Nueva ruta</Text>
      </Pressable>

      {activa && (
        <Pressable style={styles.card} onPress={() => onContinuar(activa.id)}>
          <Text style={styles.cardLabel}>Continuar ruta</Text>
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
        </Pressable>
      )}

      <Text style={styles.section}>Historial</Text>
      <Text style={styles.legend}>
        <Text style={{ color: colors.ida }}>↑ verde Ida</Text>
        {'  ·  '}
        <Text style={{ color: colors.vuelta }}>↓ azul Vuelta</Text>
      </Text>
      <FlatList
        data={historial}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} />}
        ListEmptyComponent={
          <Text style={styles.muted}>Sin rutas finalizadas.</Text>
        }
        renderItem={({ item }) => {
          const sentido = sentidoDeRuta(item)
          const esIda = sentido === 'ida'
          const fechaColor = esIda ? colors.ida : colors.vuelta
          const flecha = esIda ? '↑' : '↓'
          const fecha = formatFechaCorta(item.finalizadaEn || item.creadaEn)
          return (
            <Pressable style={styles.row} onPress={() => onResumen(item.id)}>
              <View style={styles.rowTop}>
                <Text style={[styles.fecha, { color: fechaColor }]}>
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
      style={[
        styles.badge,
        { color: esIda ? colors.ida : colors.vuelta },
      ]}
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
  card: {
    backgroundColor: colors.elev,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 18,
  },
  cardLabel: { color: colors.accent2, fontSize: 11, textTransform: 'uppercase' },
  cardTitle: { color: colors.ink, fontWeight: '600', fontSize: 16, marginTop: 2, flex: 1 },
  muted: { color: colors.muted, marginTop: 2 },
  section: { color: colors.ink, fontWeight: '600', marginBottom: 4 },
  legend: { color: colors.muted, fontSize: 12, marginBottom: 8 },
  row: {
    backgroundColor: colors.elev,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
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
