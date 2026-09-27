import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import { captureRef } from 'react-native-view-shot'
import * as Sharing from 'expo-sharing'
import { listRutas } from '../lib/storage'
import {
  ordenarRutasViaje,
  todosLosPuntos,
  trazoDeRuta,
  type TrazoMacro,
} from '../lib/mapaMacro'
import { formatFechaCorta } from '../lib/geo'
import { colors } from '../theme'
import type { Ruta } from '../models/types'

type Props = {
  rutaIds: string[]
  onBack: () => void
}

export function MapaMacroScreen({ rutaIds, onBack }: Props) {
  const mapRef = useRef<MapView>(null)
  const cardRef = useRef<View>(null)
  const [rutas, setRutas] = useState<Ruta[] | null>(null)
  const [compartiendo, setCompartiendo] = useState(false)

  useEffect(() => {
    void listRutas().then((all) => {
      const set = new Set(rutaIds)
      const picked = ordenarRutasViaje(all.filter((r) => set.has(r.id)))
      setRutas(picked)
    })
  }, [rutaIds])

  const trazos = useMemo(() => {
    if (!rutas) return [] as TrazoMacro[]
    return rutas.map(trazoDeRuta).filter((t): t is TrazoMacro => t != null)
  }, [rutas])

  const allCoords = useMemo(() => todosLosPuntos(trazos), [trazos])

  const titulo = useMemo(() => {
    if (!rutas?.length) return 'Mapa del viaje'
    if (rutas.length === 1) return rutas[0].nombre
    return `${rutas.length} rutas`
  }, [rutas])

  const subtitulo = useMemo(() => {
    if (!rutas?.length) return ''
    const fechas = rutas.map((r) =>
      formatFechaCorta(r.finalizadaEn || r.creadaEn),
    )
    const a = fechas[0]
    const b = fechas[fechas.length - 1]
    return a === b ? a : `${a} → ${b}`
  }, [rutas])

  const ajustarMapa = useCallback(() => {
    if (allCoords.length < 2) return
    mapRef.current?.fitToCoordinates(allCoords, {
      edgePadding: { top: 56, right: 36, bottom: 56, left: 36 },
      animated: false,
    })
  }, [allCoords])

  useEffect(() => {
    if (!allCoords.length) return
    const t = setTimeout(ajustarMapa, 350)
    return () => clearTimeout(t)
  }, [allCoords, ajustarMapa])

  const compartir = async () => {
    if (!trazos.length) {
      Alert.alert(
        'Sin trazado',
        'Las rutas elegidas no tienen GPS ni ruta planificada para dibujar.',
      )
      return
    }
    setCompartiendo(true)
    try {
      let uri: string | null = null
      try {
        const snap = await mapRef.current?.takeSnapshot?.({
          format: 'png',
          result: 'file',
          quality: 1,
        })
        uri = snap ?? null
      } catch {
        uri = null
      }
      if (!uri && cardRef.current) {
        uri = await captureRef(cardRef, {
          format: 'png',
          quality: 0.95,
          result: 'tmpfile',
        })
      }
      if (!uri) throw new Error('No se pudo capturar el mapa')
      const can = await Sharing.isAvailableAsync()
      if (!can) {
        Alert.alert('Listo', 'Imagen guardada, pero compartir no está disponible aquí.')
        return
      }
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Mapa del viaje',
      })
    } catch (e) {
      Alert.alert(
        'No se pudo compartir',
        e instanceof Error ? e.message : 'Error al capturar el mapa',
      )
    } finally {
      setCompartiendo(false)
    }
  }

  if (!rutas) {
    return (
      <View style={styles.page}>
        <ActivityIndicator color={colors.accent2} />
      </View>
    )
  }

  const sinTrazos = trazos.length === 0

  return (
    <View style={styles.page}>
      <View style={styles.top}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.link}>← Volver</Text>
        </Pressable>
        <Pressable
          style={[styles.btnShare, compartiendo && styles.disabled]}
          onPress={() => void compartir()}
          disabled={compartiendo || sinTrazos}
        >
          <Text style={styles.btnShareText}>
            {compartiendo ? '…' : 'Compartir'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.card} ref={cardRef} collapsable={false}>
        <Text style={styles.brand}>Ruta viva</Text>
        <Text style={styles.title} numberOfLines={2}>
          {titulo}
        </Text>
        {!!subtitulo && <Text style={styles.sub}>{subtitulo}</Text>}
        <Text style={styles.legend}>
          <Text style={{ color: colors.ida }}>Ida</Text>
          {'  ·  '}
          <Text style={{ color: colors.vuelta }}>Vuelta</Text>
          {trazos.some((t) => t.fuente === 'track')
            ? '  ·  trazo GPS'
            : '  ·  ruta planificada'}
        </Text>

        <View style={styles.mapWrap}>
          {sinTrazos ? (
            <View style={styles.emptyMap}>
              <Text style={styles.muted}>
                No hay coordenadas en las rutas seleccionadas.
              </Text>
            </View>
          ) : (
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={{
                latitude: allCoords[0]?.latitude ?? -33.45,
                longitude: allCoords[0]?.longitude ?? -70.66,
                latitudeDelta: 2,
                longitudeDelta: 2,
              }}
              onMapReady={ajustarMapa}
              rotateEnabled={false}
              pitchEnabled={false}
            >
              {trazos.map((t) => (
                <Polyline
                  key={t.rutaId}
                  coordinates={t.coords}
                  strokeColor={
                    t.sentido === 'ida' ? colors.ida : colors.vuelta
                  }
                  strokeWidth={4}
                  lineJoin="round"
                  lineCap="round"
                />
              ))}
              {trazos[0] && (
                <Marker
                  coordinate={trazos[0].coords[0]}
                  pinColor={colors.ok}
                  title="Inicio"
                  tappable={false}
                />
              )}
              {trazos[trazos.length - 1] && (
                <Marker
                  coordinate={
                    trazos[trazos.length - 1].coords[
                      trazos[trazos.length - 1].coords.length - 1
                    ]
                  }
                  pinColor={colors.accent}
                  title="Fin"
                  tappable={false}
                />
              )}
            </MapView>
          )}
        </View>
      </View>

      <Text style={styles.hint}>
        {rutas.length} seleccionada{rutas.length === 1 ? '' : 's'} ·{' '}
        {trazos.length} con mapa
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 16,
    paddingTop: 52,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  link: { color: colors.accent2, fontWeight: '700', fontSize: 16 },
  btnShare: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  btnShareText: { color: '#fff8f2', fontWeight: '800', fontSize: 14 },
  disabled: { opacity: 0.45 },
  card: {
    flex: 1,
    backgroundColor: colors.elev,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    overflow: 'hidden',
  },
  brand: {
    color: colors.accent2,
    textTransform: 'uppercase',
    letterSpacing: 2,
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 4,
  },
  sub: { color: colors.muted, marginTop: 2, fontSize: 14 },
  legend: { color: colors.muted, fontSize: 12, marginTop: 8, marginBottom: 10 },
  mapWrap: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    minHeight: 280,
  },
  map: { flex: 1 },
  emptyMap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    padding: 20,
  },
  muted: { color: colors.muted, textAlign: 'center' },
  hint: { color: colors.muted, fontSize: 12, marginTop: 10, textAlign: 'center' },
})
