import { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import type { Ruta } from '../models/types'
import { getRuta } from '../lib/storage'
import { formatCLP, formatDuration } from '../lib/geo'
import { colors } from '../theme'

type Props = {
  rutaId: string
  onHome: () => void
}

export function ResumenScreen({ rutaId, onHome }: Props) {
  const [ruta, setRuta] = useState<Ruta | null>(null)

  useEffect(() => {
    void getRuta(rutaId).then((r) => setRuta(r ?? null))
  }, [rutaId])

  if (!ruta) {
    return (
      <View style={styles.page}>
        <Text style={styles.muted}>Cargando…</Text>
      </View>
    )
  }

  const peajes = ruta.gastos.filter((g) => g.categoria === 'peaje')

  return (
    <ScrollView style={styles.page} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.eyebrow}>Ruta finalizada</Text>
      <Text style={styles.title}>{ruta.nombre}</Text>
      <Text style={styles.lede}>
        {ruta.origen?.nombre ?? 'Origen'} → {ruta.destino?.nombre ?? 'Sin destino'}
      </Text>

      <View style={styles.stats}>
        <Stat label="Total tiempo" value={formatDuration(ruta.tiempos.totalSeg)} />
        <Stat label="Movimiento" value={formatDuration(ruta.tiempos.movimientoSeg)} />
        <Stat
          label="Pausas"
          value={`${ruta.pausas.length} · ${formatDuration(ruta.tiempos.pausasSeg)}`}
        />
        <Stat label="Costo" value={formatCLP(ruta.costos.total)} highlight />
      </View>

      <Text style={styles.section}>Peajes ({peajes.length})</Text>
      {peajes.map((g) => (
        <View key={g.id} style={styles.row}>
          <Text style={styles.rowTitle}>{g.nombre}</Text>
          <Text style={styles.muted}>{formatCLP(g.monto)}</Text>
        </View>
      ))}

      <Text style={styles.section}>Gastos manuales</Text>
      {ruta.gastos
        .filter((g) => !g.automatico)
        .map((g) => (
          <View key={g.id} style={styles.row}>
            <Text style={styles.rowTitle}>
              {g.nombre} · {g.categoria}
            </Text>
            <Text style={styles.muted}>{formatCLP(g.monto)}</Text>
          </View>
        ))}

      <Pressable style={styles.btnPrimary} onPress={onHome}>
        <Text style={styles.btnPrimaryText}>Listo</Text>
      </Pressable>
    </ScrollView>
  )
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.statVal, highlight && { color: colors.accent2 }]}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 20, paddingTop: 56 },
  eyebrow: { color: colors.accent2, textTransform: 'uppercase', letterSpacing: 2, fontSize: 11 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '700', marginTop: 4 },
  lede: { color: colors.muted, marginBottom: 16 },
  muted: { color: colors.muted },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  stat: {
    width: '47%',
    backgroundColor: colors.elev,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statVal: { color: colors.ink, fontWeight: '700', fontSize: 16, marginTop: 4 },
  section: { color: colors.ink, fontWeight: '600', marginTop: 10, marginBottom: 6 },
  row: {
    backgroundColor: colors.elev,
    borderRadius: 10,
    padding: 12,
    marginBottom: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  rowTitle: { color: colors.ink, fontWeight: '600' },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 20,
  },
  btnPrimaryText: { color: '#fff8f2', fontWeight: '700', fontSize: 17 },
})
