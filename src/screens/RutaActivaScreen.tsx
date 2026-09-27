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
import * as DocumentPicker from 'expo-document-picker'
import { useKeepAwake } from 'expo-keep-awake'
import { PEAJES_CATALOGO } from '../data/peajes-demo'
import { distanciaMetros, formatCLP, formatDuration, newId } from '../lib/geo'
import { rumboDesdeTrack, zoomPorVelocidad } from '../lib/mapaVelocidad'
import { detectarMontoDesdeUri } from '../lib/ocrBoleta'
import {
  distanciaARutaMetros,
  fetchRutaDriving,
  type LatLng,
} from '../lib/routing'
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
  const [chromeVisible, setChromeVisible] = useState(true)
  const [showDebug, setShowDebug] = useState(false)
  const [rutaSugerida, setRutaSugerida] = useState<LatLng[]>([])
  const [rutaInfo, setRutaInfo] = useState<{ km: number; min: number } | null>(
    null,
  )
  const hideChromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastRerouteAt = useRef(0)
  const routingBusy = useRef(false)
  const rutaSugeridaRef = useRef<LatLng[]>([])
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
  const ocrGen = useRef(0)
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

  const recalcularRuta = useCallback(
    async (from: LatLng, silent?: boolean) => {
      const r = rutaRef.current
      if (!r?.destino || routingBusy.current) return
      routingBusy.current = true
      try {
        const result = await fetchRutaDriving(from, {
          latitude: r.destino.lat,
          longitude: r.destino.lng,
        })
        rutaSugeridaRef.current = result.coords
        setRutaSugerida(result.coords)
        setRutaInfo({
          km: result.distanceM / 1000,
          min: Math.round(result.durationSeg / 60),
        })
        if (!silent) {
          setToast('Ruta actualizada (te desviaste)')
          setTimeout(() => setToast(null), 2800)
        }
      } catch {
        if (!silent) {
          setToast('No se pudo trazar la ruta')
          setTimeout(() => setToast(null), 2800)
        }
      } finally {
        routingBusy.current = false
      }
    },
    [],
  )

  // Primera ruta: origen → destino
  useEffect(() => {
    const r = ruta
    if (!r?.destino) return
    const from: LatLng = r.origen
      ? { latitude: r.origen.lat, longitude: r.origen.lng }
      : { latitude: -33.45, longitude: -70.66 }
    void recalcularRuta(from, true)
  }, [ruta?.id, ruta?.destino?.lat, ruta?.destino?.lng, recalcularRuta])

  const maybePeajeYDestino = useCallback(
    async (lat: number, lng: number) => {
      const r = rutaRef.current
      if (!r || r.estado !== 'en_curso') return
      let next = r
      let changed = false

      for (const peaje of PEAJES_CATALOGO) {
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

          // Si te desviás de la sugerencia → recalcular desde aquí al destino
          const sugerida = rutaSugeridaRef.current
          if (sugerida.length > 2 && now - lastRerouteAt.current > 12000) {
            const off = distanciaARutaMetros(
              { latitude: lat, longitude: lng },
              sugerida,
            )
            if (off > 90) {
              lastRerouteAt.current = now
              void recalcularRuta({ latitude: lat, longitude: lng }, false)
            }
          }
        },
      )
    })()
    return () => {
      sub?.remove()
    }
  }, [maybePeajeYDestino, recalcularRuta, simVel])

  const vel = simVel ?? pos?.velKmh ?? 0
  const pausada = ruta?.estado === 'pausada'
  const latDelta = zoomPorVelocidad(vel, !!pausada)
  const bearing =
    !pausada && vel >= 8 ? rumboDesdeTrack(ruta?.track ?? []) ?? 0 : 0

  const scheduleHideChrome = useCallback(() => {
    if (hideChromeTimer.current) clearTimeout(hideChromeTimer.current)
    hideChromeTimer.current = setTimeout(() => {
      if (rutaRef.current?.estado === 'en_curso') setChromeVisible(false)
    }, 4500)
  }, [])

  const toggleChrome = useCallback(() => {
    setChromeVisible((v) => {
      const next = !v
      if (next) scheduleHideChrome()
      return next
    })
  }, [scheduleHideChrome])

  useEffect(() => {
    if (pausada) {
      setChromeVisible(true)
      if (hideChromeTimer.current) clearTimeout(hideChromeTimer.current)
      return
    }
    scheduleHideChrome()
    return () => {
      if (hideChromeTimer.current) clearTimeout(hideChromeTimer.current)
    }
  }, [pausada, scheduleHideChrome])

  useEffect(() => {
    if (!pos || !mapRef.current) return
    const now = Date.now()
    if (now - lastCamAt.current < 2200) return
    lastCamAt.current = now

    // En marcha: rumbo arriba (GPS). En pausa / lento: norte arriba.
    const headingUp = !pausada && vel >= 10
    // altitude aprox. desde el “zoom” por velocidad
    const altitude = Math.max(450, Math.min(latDelta * 111_000 * 1.35, 12_000))
    mapRef.current.animateCamera(
      {
        center: { latitude: pos.lat, longitude: pos.lng },
        heading: headingUp ? bearing : 0,
        pitch: headingUp && vel >= 40 ? 42 : 0,
        altitude,
      },
      { duration: 650 },
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

  const resetOcrForm = () => {
    ocrGen.current += 1
    setFotoUri(null)
    setMonto('')
    setOcrCandidatos([])
    setOcrStatus('idle')
  }

  const correrOcr = async (
    uri: string,
    meta?: { mimeType?: string | null; fileName?: string | null },
  ) => {
    const gen = ++ocrGen.current
    setOcrStatus('loading')
    setOcrCandidatos([])
    setMonto('') // nunca reutilizar monto de la foto anterior
    try {
      const { sugerido, candidatos } = await detectarMontoDesdeUri(uri, meta)
      if (gen !== ocrGen.current) return // llegó tarde otra foto
      setOcrCandidatos(candidatos)
      if (sugerido != null) {
        setMonto(String(sugerido))
        setOcrStatus('ok')
        showToast(`Detectado ${formatCLP(sugerido)} · confirmá`)
        Alert.alert(
          'Monto detectado',
          `${formatCLP(sugerido)}\n\nConfirmá o corregí. Si no coincide, escribilo a mano.`,
        )
      } else {
        setOcrStatus('fail')
        Alert.alert(
          'Sin monto',
          'No encontré el total. Probá otra foto más nítida o escribí el monto a mano.',
        )
      }
    } catch (e) {
      if (gen !== ocrGen.current) return
      setOcrStatus('fail')
      const msg = e instanceof Error ? e.message : 'Error de red/OCR'
      const amable = msg.includes('FORMATO_NO_SOPORTADO')
        ? 'Ese archivo venía en un formato que el lector no acepta (a veces HEIC). Probá “Elegir de galería” de nuevo o sacá una foto JPG con la cámara.'
        : msg
      Alert.alert(
        'No se pudo leer',
        `${amable}\n\nTambién podés escribir el monto a mano.`,
      )
    }
  }

  const aplicarImagen = (
    uri: string,
    meta?: { mimeType?: string | null; fileName?: string | null },
  ) => {
    // Limpiar sugerencia anterior ANTES de leer la nueva
    setMonto('')
    setOcrCandidatos([])
    setOcrStatus('loading')
    setFotoUri(uri)
    void correrOcr(uri, meta)
  }

  /** Fotos del carrete (HEIC se convierte a JPG al leer). */
  const elegirDeGaleria = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Galería', 'Necesitamos permiso para elegir la imagen.')
      return
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    })
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0]
      aplicarImagen(a.uri, {
        mimeType: a.mimeType ?? 'image/jpeg',
        fileName: a.fileName ?? 'comprobante.jpg',
      })
    }
  }

  /** Archivos: JPG/PNG/PDF desde Archivos / carpetas. */
  const elegirArchivo = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['image/*', 'application/pdf'],
      copyToCacheDirectory: true,
      multiple: false,
    })
    if (res.canceled || !res.assets?.[0]) return
    const a = res.assets[0]
    aplicarImagen(a.uri, { mimeType: a.mimeType, fileName: a.name })
  }

  const tomarConCamara = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Cámara', 'Necesitamos permiso de cámara.')
      return
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    })
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0]
      aplicarImagen(a.uri, {
        mimeType: a.mimeType ?? 'image/jpeg',
        fileName: a.fileName ?? 'foto.jpg',
      })
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
    setNombreGasto('')
    resetOcrForm()
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
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        initialRegion={{
          latitude: pos?.lat ?? ruta.origen?.lat ?? -33.45,
          longitude: pos?.lng ?? ruta.origen?.lng ?? -70.66,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
        showsUserLocation
        followsUserLocation={false}
        onPress={toggleChrome}
      >
        {PEAJES_CATALOGO.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            pinColor={p.viajeCopiapo || p.opcionA ? '#c45c26' : '#8a8175'}
            title={p.nombre}
            description={`Moto ${formatCLP(p.tarifaMotoNormal)}`}
            tappable={false}
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
            tappable={false}
          />
        )}
        {rutaSugerida.length >= 2 && (
          <Polyline
            coordinates={rutaSugerida}
            strokeColor="#3b82f6"
            strokeWidth={5}
          />
        )}
        {coords.length >= 2 && (
          <Polyline coordinates={coords} strokeColor="#c45c26" strokeWidth={4} />
        )}
        {ruta.origen && (
          <Marker
            coordinate={{
              latitude: ruta.origen.lat,
              longitude: ruta.origen.lng,
            }}
            pinColor="#22c55e"
            title="Inicio"
            tappable={false}
          />
        )}
      </MapView>

      {/* Mini info siempre visible (como Waze) — long press abre debug */}
      <Pressable
        style={styles.miniHud}
        onLongPress={() => {
          setShowDebug((d) => !d)
          setChromeVisible(true)
          showToast(showDebug ? 'Debug oculto' : 'Debug visible')
        }}
        delayLongPress={600}
      >
        <Text style={styles.miniSpeed}>{Math.round(vel)}</Text>
        <Text style={styles.miniUnit}>km/h</Text>
        <Text style={styles.miniMeta}>
          {formatDuration(tiemposLive?.totalSeg ?? 0)} · {formatCLP(ruta.costos.total)}
        </Text>
        {rutaInfo && (
          <Text style={styles.miniMeta}>
            → {rutaInfo.km.toFixed(1)} km · {rutaInfo.min} min
          </Text>
        )}
      </Pressable>

      {chromeVisible && (
        <>
          {(ruta.destino || pausada) && (
            <View style={styles.hudOverlay} pointerEvents="none">
              <Text style={styles.title} numberOfLines={1}>
                {pausada ? 'Pausada' : ruta.destino?.nombre ?? ruta.nombre}
              </Text>
            </View>
          )}

          <View style={styles.actionsOverlay}>
            {!pausada ? (
              <>
                <Pressable
                  style={styles.btnPrimary}
                  onPress={() => {
                    scheduleHideChrome()
                    void pausar()
                  }}
                >
                  <Text style={styles.btnPrimaryText}>Pausa</Text>
                </Pressable>
                <Pressable style={styles.btnGhost} onPress={() => void finalizar()}>
                  <Text style={styles.ghostText}>Finalizar</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  style={styles.btnPrimary}
                  onPress={() => setShowGasto(true)}
                >
                  <Text style={styles.btnPrimaryText}>Gasto</Text>
                </Pressable>
                <Pressable style={styles.btnPrimary} onPress={() => void reanudar()}>
                  <Text style={styles.btnPrimaryText}>Reanudar</Text>
                </Pressable>
                <Pressable style={styles.btnGhost} onPress={() => void finalizar()}>
                  <Text style={styles.ghostText}>Finalizar</Text>
                </Pressable>
              </>
            )}

            {showDebug && (
              <View style={styles.debug}>
                <Text style={styles.muted}>Debug · mantén km/h para ocultar</Text>
                <View style={styles.debugRow}>
                  {[0, 40, 90, 120].map((v) => (
                    <Pressable
                      key={v}
                      style={styles.debugBtn}
                      onPress={() => {
                        setSimVel(v === 0 ? null : v)
                        showToast(v === 0 ? 'GPS real' : `Simular ${v} km/h`)
                        scheduleHideChrome()
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
                      const pending = PEAJES_CATALOGO.find(
                        (p) => !ruta.gastos.some((g) => g.peajeId === p.id),
                      )
                      if (!pending) return showToast('No quedan peajes')
                      setPos({
                        lat: pending.lat,
                        lng: pending.lng,
                        velKmh: simVel ?? 60,
                      })
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
                      void maybePeajeYDestino(
                        ruta.destino.lat,
                        ruta.destino.lng,
                      )
                    }}
                  >
                    <Text style={styles.ghostText}>Simular llegada</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        </>
      )}

      {toast && (
        <View style={styles.toast}>
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}

      <Modal visible={showGasto} animationType="slide" transparent>
        <View style={styles.sheetWrap}>
          <ScrollView style={styles.sheet} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.title}>Agregar gasto</Text>
            <Text style={styles.muted}>
              Boleta, factura, voucher o ticket · JPG/PNG/PDF · confirmá el monto
            </Text>
            <Pressable
              style={styles.btnPrimary}
              onPress={() => void elegirDeGaleria()}
              disabled={ocrStatus === 'loading'}
            >
              <Text style={styles.btnPrimaryText}>
                {ocrStatus === 'loading'
                  ? 'Leyendo comprobante…'
                  : 'Elegir de galería (Fotos)'}
              </Text>
            </Pressable>
            <Pressable
              style={styles.btnGhost}
              onPress={() => void elegirArchivo()}
              disabled={ocrStatus === 'loading'}
            >
              <Text style={styles.ghostText}>Elegir archivo (JPG / PNG / PDF)</Text>
            </Pressable>
            <Pressable
              style={styles.btnGhost}
              onPress={() => void tomarConCamara()}
              disabled={ocrStatus === 'loading'}
            >
              <Text style={styles.ghostText}>Sacar foto ahora (cámara)</Text>
            </Pressable>
            {fotoUri && (
              <Pressable style={styles.btnGhost} onPress={resetOcrForm}>
                <Text style={styles.ghostText}>Quitar foto y monto</Text>
              </Pressable>
            )}
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
                setNombreGasto('')
                resetOcrForm()
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
  page: { flex: 1, backgroundColor: '#000' },
  miniHud: {
    position: 'absolute',
    top: 54,
    left: 14,
    backgroundColor: 'rgba(20,16,12,0.82)',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.line,
    zIndex: 5,
    minWidth: 96,
  },
  miniSpeed: {
    color: colors.ink,
    fontSize: 42,
    fontWeight: '800',
    lineHeight: 44,
  },
  miniUnit: { color: colors.accent2, fontSize: 13, fontWeight: '700' },
  miniMeta: { color: colors.muted, marginTop: 4, fontSize: 13 },
  hudOverlay: {
    position: 'absolute',
    top: 58,
    right: 14,
    maxWidth: '48%',
    backgroundColor: 'rgba(20,16,12,0.75)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.line,
    zIndex: 6,
  },
  actionsOverlay: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 34,
    gap: 10,
    zIndex: 6,
  },
  title: { color: colors.ink, fontSize: 17, fontWeight: '700' },
  muted: { color: colors.muted, fontSize: 12 },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 18,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff8f2', fontWeight: '800', fontSize: 18 },
  btnGhost: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    backgroundColor: 'rgba(20,16,12,0.8)',
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ghostText: { color: colors.ink, fontWeight: '600', fontSize: 16 },
  back: { color: colors.accent2, marginTop: 12 },
  toast: {
    position: 'absolute',
    top: 120,
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
  debug: {
    backgroundColor: 'rgba(20,16,12,0.75)',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
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
