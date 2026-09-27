import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  Image,
  ScrollView,
  AppState,
} from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import * as Location from 'expo-location'
import * as ImagePicker from 'expo-image-picker'
import { useKeepAwake } from 'expo-keep-awake'
import { PEAJES_DEMO } from '../data/peajes-demo'
import { distanciaMetros, formatCLP, formatDuration, newId } from '../lib/geo'
import { rumboDesdeTrack, zoomPorVelocidad } from '../lib/mapaVelocidad'
import { detectarMontoDesdeUri } from '../lib/ocrBoleta'
import { getRuta, saveRuta } from '../lib/storage'
import {
  recalcularCostos,
  type CategoriaGasto,
  type Ruta,
} from '../models/types'
import { colors } from '../theme'

type Props = {
  rutaId: string
  onFinalizada: (id: string) => void
  onHome: () => void
}

type Pos = { lat: number; lng: number; velKmh: number }

const CATS: Exclude<CategoriaGasto, 'peaje'>[] = [
  'bencina',
  'comida',
  'alojamiento',
  'taller',
  'otro',
]

export function RutaActivaScreen({ rutaId, onFinalizada, onHome }: Props) {
  const [ruta, setRuta] = useState<Ruta | null>(null)
  const [pos, setPos] = useState<Pos | null>(null)
  const [simVel, setSimVel] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [showGasto, setShowGasto] = useState(false)
  const [monto, setMonto] = useState('')
  const [nombreGasto, setNombreGasto] = useState('')
  const [cat, setCat] = useState<Exclude<CategoriaGasto, 'peaje'>>('comida')
  const [fotoUri, setFotoUri] = useState<string | null>(null)
  const [ocrStatus, setOcrStatus] = useState<'idle' | 'loading' | 'ok' | 'fail'>(
    'idle',
  )
  const [ocrCandidatos, setOcrCandidatos] = useState<number[]>([])
  const rutaRef = useRef<Ruta | null>(null)
  const mapRef = useRef<MapView | null>(null)
  const lastCamAt = useRef(0)
  const lastPersistTrackAt = useRef(0)
  const [uiTick, setUiTick] = useState(0)

  const persist = useCallback(async (next: Ruta) => {
    rutaRef.current = next
    setRuta(next)
    await saveRuta(next)
  }, [])

  useEffect(() => {
    void getRuta(rutaId).then((r) => {
      if (r) {
        rutaRef.current = r
        setRuta(r)
      }
    })
  }, [rutaId])

  // Evita que iOS apague la pantalla (~1 min) y mate Expo Go / el tunnel
  useKeepAwake('ruta-viva-activa')

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        const r = rutaRef.current
        if (r && r.estado !== 'finalizada') {
          void saveRuta(r)
        }
      }
    })
    return () => sub.remove()
  }, [])

  // Solo refresca el reloj en UI; no escribe AsyncStorage cada segundo
  useEffect(() => {
    const id = setInterval(() => setUiTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const tiemposLive = useMemo(() => {
    const r = ruta
    if (!r?.iniciadaEn) return r?.tiempos
    void uiTick
    const now = Date.now()
    const totalSeg = Math.floor((now - new Date(r.iniciadaEn).getTime()) / 1000)
    const pausasSeg = r.pausas.reduce((acc, p) => {
      const fin = p.fin ? new Date(p.fin).getTime() : now
      return acc + Math.floor((fin - new Date(p.inicio).getTime()) / 1000)
    }, 0)
    return {
      totalSeg,
      pausasSeg,
      movimientoSeg: Math.max(0, totalSeg - pausasSeg),
    }
  }, [ruta, uiTick])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2800)
  }

  const maybePeajeYDestino = useCallback(
    async (lat: number, lng: number) => {
      const r = rutaRef.current
      if (!r || r.estado !== 'en_curso') return
      let next = r
      let changed = false

      for (const peaje of PEAJES_DEMO) {
        const d = distanciaMetros(lat, lng, peaje.lat, peaje.lng)
        if (d <= peaje.radioMetros && !next.gastos.some((g) => g.peajeId === peaje.id)) {
          const gastos = [
            ...next.gastos,
            {
              id: newId(),
              categoria: 'peaje' as const,
              monto: peaje.tarifaMotoNormal,
              nombre: peaje.nombre,
              lat: peaje.lat,
              lng: peaje.lng,
              fotoUri: null,
              peajeId: peaje.id,
              automatico: true,
              creadoEn: new Date().toISOString(),
            },
          ]
          next = { ...next, gastos, costos: recalcularCostos(gastos) }
          changed = true
          showToast(`Peaje ${peaje.nombre} · ${formatCLP(peaje.tarifaMotoNormal)}`)
        }
      }

      if (next.destino) {
        const dDest = distanciaMetros(lat, lng, next.destino.lat, next.destino.lng)
        if (dDest <= next.radioLlegadaMetros) {
          next = {
            ...next,
            estado: 'finalizada',
            finalizadaEn: new Date().toISOString(),
          }
          await persist(next)
          onFinalizada(next.id)
          return
        }
      }
      if (changed) await persist(next)
    },
    [onFinalizada, persist],
  )

  useEffect(() => {
    let sub: Location.LocationSubscription | null = null
    ;(async () => {
      const fg = await Location.requestForegroundPermissionsAsync()
      if (fg.status !== 'granted') return
      // En Expo Go el background es limitado; igual pedimos permiso
      try {
        await Location.requestBackgroundPermissionsAsync()
      } catch {
        /* ignore */
      }
      sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 3000,
          distanceInterval: 12,
          mayShowUserSettingsDialog: true,
        },
        (loc) => {
          const lat = loc.coords.latitude
          const lng = loc.coords.longitude
          const gpsVel = Math.max(0, (loc.coords.speed ?? 0) * 3.6)
          const velKmh = simVel ?? gpsVel
          setPos({ lat, lng, velKmh })
          const r = rutaRef.current
          if (!r || r.estado !== 'en_curso') return

          const now = Date.now()
          const trackPoint = {
            t: new Date().toISOString(),
            lat,
            lng,
            velKmh,
          }
          // Actualiza memoria siempre; persiste a disco como máximo cada 8s
          const track = [...r.track, trackPoint].slice(-1500)
          const next = { ...r, track }
          rutaRef.current = next
          setRuta(next)
          void maybePeajeYDestino(lat, lng)
          if (now - lastPersistTrackAt.current > 8000) {
            lastPersistTrackAt.current = now
            void saveRuta(next)
          }
        },
      )
    })()
    return () => {
      sub?.remove()
    }
  }, [maybePeajeYDestino, simVel])

  const vel = simVel ?? pos?.velKmh ?? 0
  const pausada = ruta?.estado === 'pausada'
  const latDelta = zoomPorVelocidad(vel, !!pausada)
  const bearing =
    !pausada && vel >= 8 ? rumboDesdeTrack(ruta?.track ?? []) ?? 0 : 0

  useEffect(() => {
    if (!pos || !mapRef.current) return
    const now = Date.now()
    if (now - lastCamAt.current < 2500) return
    lastCamAt.current = now
    mapRef.current.animateToRegion(
      {
        latitude: pos.lat,
        longitude: pos.lng,
        latitudeDelta: latDelta,
        longitudeDelta: latDelta,
      },
      700,
    )
  }, [pos?.lat, pos?.lng, latDelta, bearing, pausada, vel])

  const pausar = async () => {
    const r = rutaRef.current
    if (!r || r.estado !== 'en_curso') return
    await persist({
      ...r,
      estado: 'pausada',
      pausas: [
        ...r.pausas,
        {
          id: newId(),
          inicio: new Date().toISOString(),
          fin: null,
          lat: pos?.lat ?? r.origen?.lat ?? 0,
          lng: pos?.lng ?? r.origen?.lng ?? 0,
        },
      ],
    })
  }

  const reanudar = async () => {
    const r = rutaRef.current
    if (!r || r.estado !== 'pausada') return
    const pausas = r.pausas.map((p, i) =>
      i === r.pausas.length - 1 && !p.fin
        ? { ...p, fin: new Date().toISOString() }
        : p,
    )
    await persist({ ...r, estado: 'en_curso', pausas })
  }

  const finalizar = async () => {
    const r = rutaRef.current
    if (!r) return
    let pausas = r.pausas
    if (r.estado === 'pausada') {
      pausas = pausas.map((p, i) =>
        i === pausas.length - 1 && !p.fin
          ? { ...p, fin: new Date().toISOString() }
          : p,
      )
    }
    const next = {
      ...r,
      pausas,
      tiempos: tiemposLive ?? r.tiempos,
      estado: 'finalizada' as const,
      finalizadaEn: new Date().toISOString(),
    }
    await persist(next)
    onFinalizada(next.id)
  }

  const correrOcr = async (uri: string) => {
    setOcrStatus('loading')
    setOcrCandidatos([])
    try {
      const { sugerido, candidatos } = await detectarMontoDesdeUri(uri)
      setOcrCandidatos(candidatos)
      if (sugerido != null) {
        setMonto(String(sugerido))
        setOcrStatus('ok')
        showToast(`Detectado ${formatCLP(sugerido)} · confirmá`)
      } else {
        setOcrStatus('fail')
      }
    } catch {
      setOcrStatus('fail')
    }
  }

  const tomarFoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Cámara', 'Necesitamos permiso de cámara.')
      return
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.55,
      allowsEditing: false,
    })
    if (!res.canceled && res.assets[0]) {
      const uri = res.assets[0].uri
      setFotoUri(uri)
      void correrOcr(uri)
    }
  }

  const guardarGasto = async () => {
    const r = rutaRef.current
    if (!r) return
    const n = Number(monto.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0) {
      Alert.alert('Monto', 'Ingresá un monto válido.')
      return
    }
    const gastos = [
      ...r.gastos,
      {
        id: newId(),
        categoria: cat,
        monto: Math.round(n),
        nombre: nombreGasto.trim() || cat,
        lat: pos?.lat ?? 0,
        lng: pos?.lng ?? 0,
        fotoUri,
        peajeId: null,
        automatico: false,
        creadoEn: new Date().toISOString(),
      },
    ]
    await persist({ ...r, gastos, costos: recalcularCostos(gastos) })
    setShowGasto(false)
    setMonto('')
    setNombreGasto('')
    setFotoUri(null)
    setOcrStatus('idle')
    setOcrCandidatos([])
  }

  const coords = useMemo(
    () =>
      (ruta?.track ?? []).map((t) => ({
        latitude: t.lat,
        longitude: t.lng,
      })),
    [ruta?.track],
  )

  if (!ruta) {
    return (
      <View style={styles.page}>
        <Text style={styles.muted}>Cargando…</Text>
        <Pressable onPress={onHome}>
          <Text style={styles.back}>Home</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <View style={styles.page}>
      <View style={styles.hud}>
        <Text style={styles.title}>{ruta.nombre}</Text>
        <Text style={styles.muted}>
          {pausada ? 'Pausada' : 'En curso'} ·{' '}
          {formatDuration(tiemposLive?.totalSeg ?? ruta.tiempos.totalSeg)} ·{' '}
          {formatCLP(ruta.costos.total)}
        </Text>
        <Text style={styles.speed}>
          {Math.round(vel)} km/h · zoom {pausada || vel < 8 ? 'cerca' : vel < 70 ? 'medio' : 'lejos'}
        </Text>
        {ruta.destino && (
          <Text style={styles.chip}>→ {ruta.destino.nombre}</Text>
        )}
        <Text style={styles.keepOn}>
          Pantalla siempre encendida en ruta. No bloquees el iPhone ni cierres Expo Go.
        </Text>
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: pos?.lat ?? ruta.origen?.lat ?? -33.45,
          longitude: pos?.lng ?? ruta.origen?.lng ?? -70.66,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation
        followsUserLocation={false}
      >
        {PEAJES_DEMO.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            pinColor="#c45c26"
            title={p.nombre}
          />
        ))}
        {ruta.destino && (
          <Marker
            coordinate={{
              latitude: ruta.destino.lat,
              longitude: ruta.destino.lng,
            }}
            pinColor="#3b82f6"
            title={ruta.destino.nombre}
          />
        )}
        {coords.length >= 2 && (
          <Polyline coordinates={coords} strokeColor="#c45c26" strokeWidth={4} />
        )}
      </MapView>

      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <View style={styles.actions}>
        {!pausada ? (
          <>
            <Pressable style={styles.btnPrimary} onPress={() => void pausar()}>
              <Text style={styles.btnPrimaryText}>Pausa</Text>
            </Pressable>
            <Pressable style={styles.btnGhost} onPress={() => void finalizar()}>
              <Text style={styles.ghostText}>Finalizar ruta</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable style={styles.btnPrimary} onPress={() => setShowGasto(true)}>
              <Text style={styles.btnPrimaryText}>Agregar gasto</Text>
            </Pressable>
            <Pressable style={styles.btnPrimary} onPress={() => void reanudar()}>
              <Text style={styles.btnPrimaryText}>Reanudar</Text>
            </Pressable>
            <Pressable style={styles.btnGhost} onPress={() => void finalizar()}>
              <Text style={styles.ghostText}>Finalizar ruta</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={styles.debug}>
        <Text style={styles.muted}>Debug velocidad</Text>
        <View style={styles.debugRow}>
          {[0, 40, 90, 120].map((v) => (
            <Pressable
              key={v}
              style={styles.debugBtn}
              onPress={() => {
                setSimVel(v === 0 ? null : v)
                showToast(v === 0 ? 'GPS real' : `Simular ${v} km/h`)
              }}
            >
              <Text style={styles.ghostText}>{v === 0 ? 'GPS' : `${v}`}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.debugRow}>
          <Pressable
            style={styles.debugBtn}
            onPress={() => {
              const pending = PEAJES_DEMO.find(
                (p) => !ruta.gastos.some((g) => g.peajeId === p.id),
              )
              if (!pending) return showToast('No quedan peajes')
              setPos({ lat: pending.lat, lng: pending.lng, velKmh: simVel ?? 60 })
              void maybePeajeYDestino(pending.lat, pending.lng)
            }}
          >
            <Text style={styles.ghostText}>Simular peaje</Text>
          </Pressable>
          <Pressable
            style={styles.debugBtn}
            onPress={() => {
              if (!ruta.destino) return
              setPos({
                lat: ruta.destino.lat,
                lng: ruta.destino.lng,
                velKmh: 0,
              })
              void maybePeajeYDestino(ruta.destino.lat, ruta.destino.lng)
            }}
          >
            <Text style={styles.ghostText}>Simular llegada</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={showGasto} animationType="slide" transparent>
        <View style={styles.sheetWrap}>
          <ScrollView style={styles.sheet} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.title}>Agregar gasto</Text>
            <Text style={styles.muted}>
              Solo detenido · sacá foto y confirmá el monto sugerido
            </Text>
            <Pressable style={styles.btnGhost} onPress={() => void tomarFoto()}>
              <Text style={styles.ghostText}>
                {ocrStatus === 'loading'
                  ? 'Leyendo boleta…'
                  : fotoUri
                    ? 'Foto lista · cambiar'
                    : 'Sacar foto boleta'}
              </Text>
            </Pressable>
            {fotoUri && (
              <Image source={{ uri: fotoUri }} style={styles.foto} />
            )}
            {ocrStatus === 'loading' && (
              <Text style={styles.muted}>Detectando monto (necesita internet)…</Text>
            )}
            {ocrStatus === 'ok' && (
              <Text style={styles.ocrOk}>
                Monto sugerido: {formatCLP(Number(monto) || 0)}. Confirmá o corregí.
              </Text>
            )}
            {ocrStatus === 'fail' && (
              <Text style={styles.ocrFail}>
                No pude leer el monto. Escribilo a mano.
              </Text>
            )}
            {ocrCandidatos.length > 1 && (
              <View style={styles.debugRow}>
                {ocrCandidatos.map((c) => (
                  <Pressable
                    key={c}
                    style={styles.debugBtn}
                    onPress={() => setMonto(String(c))}
                  >
                    <Text style={styles.ghostText}>{formatCLP(c)}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <View style={styles.debugRow}>
              {CATS.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.debugBtn, cat === c && styles.debugBtnOn]}
                  onPress={() => setCat(c)}
                >
                  <Text style={styles.ghostText}>{c}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              style={styles.input}
              keyboardType="numeric"
              placeholder="Monto CLP"
              placeholderTextColor={colors.muted}
              value={monto}
              onChangeText={setMonto}
            />
            <TextInput
              style={styles.input}
              placeholder="Nombre (Almuerzo)"
              placeholderTextColor={colors.muted}
              value={nombreGasto}
              onChangeText={setNombreGasto}
            />
            <Pressable style={styles.btnPrimary} onPress={() => void guardarGasto()}>
              <Text style={styles.btnPrimaryText}>Confirmar y guardar</Text>
            </Pressable>
            <Pressable
              style={styles.btnGhost}
              onPress={() => {
                setShowGasto(false)
                setOcrStatus('idle')
                setOcrCandidatos([])
              }}
            >
              <Text style={styles.ghostText}>Cancelar</Text>
            </Pressable>
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 48 },
  hud: { paddingHorizontal: 16, marginBottom: 8 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  muted: { color: colors.muted },
  speed: { color: colors.accent2, marginTop: 4, fontWeight: '600' },
  keepOn: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },
  chip: {
    alignSelf: 'flex-start',
    marginTop: 6,
    color: colors.accent2,
    backgroundColor: 'rgba(232,163,92,0.15)',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  map: { flex: 1, marginHorizontal: 12, borderRadius: 14 },
  actions: { padding: 12, gap: 8 },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff8f2', fontWeight: '700', fontSize: 16 },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: 'center',
  },
  ghostText: { color: colors.ink },
  back: { color: colors.accent2, marginTop: 12 },
  toast: {
    position: 'absolute',
    top: 56,
    alignSelf: 'center',
    backgroundColor: '#111',
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    zIndex: 20,
  },
  toastText: { color: colors.ink },
  debug: { paddingHorizontal: 12, paddingBottom: 10 },
  debugRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  debugBtn: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  debugBtnOn: { backgroundColor: 'rgba(196,92,38,0.35)' },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    maxHeight: '85%',
    backgroundColor: colors.elev,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
  input: {
    backgroundColor: '#120f0c',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    color: colors.ink,
    marginTop: 8,
  },
  foto: { width: '100%', height: 140, borderRadius: 12, marginTop: 8 },
  ocrOk: { color: colors.ok, marginTop: 8, fontWeight: '600' },
  ocrFail: { color: colors.danger, marginTop: 8 },
})
