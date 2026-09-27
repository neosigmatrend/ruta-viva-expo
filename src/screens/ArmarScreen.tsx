import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  ScrollView,
} from 'react-native'
import MapView, { Marker, Polyline } from 'react-native-maps'
import * as Location from 'expo-location'
import { PEAJES_CATALOGO } from '../data/peajes-demo'
import { formatCLP, formatDuration, newId } from '../lib/geo'
import {
  estimadoMotoPeajes,
  fetchRutasDriving,
  peajesEnRuta,
  type LatLng,
  type RutaOpcion,
} from '../lib/routing'
import { saveRuta } from '../lib/storage'
import {
  costosVacios,
  tiemposVacios,
  type GeoPoint,
  type PeajeCatalogo,
  type Ruta,
} from '../models/types'
import { colors } from '../theme'

type Props = {
  onCancel: () => void
  onIniciada: (id: string) => void
}

export function ArmarScreen({ onCancel, onIniciada }: Props) {
  const [nombre, setNombre] = useState('')
  const [destLabel, setDestLabel] = useState('Destino')
  const [destino, setDestino] = useState<GeoPoint | null>(null)
  const [origen, setOrigen] = useState<GeoPoint | null>(null)
  const [opciones, setOpciones] = useState<RutaOpcion[]>([])
  const [sel, setSel] = useState(0)
  const [peajesSel, setPeajesSel] = useState<PeajeCatalogo[]>([])
  const [routing, setRouting] = useState(false)
  const [busy, setBusy] = useState(false)
  const mapRef = useRef<MapView>(null)

  const fijarDestino = (latitude: number, longitude: number) => {
    Keyboard.dismiss()
    const point: GeoPoint = {
      nombre: destLabel.trim() || 'Destino',
      lat: latitude,
      lng: longitude,
    }
    setDestino(point)
    setOpciones([])
    setPeajesSel([])
    setSel(0)
    mapRef.current?.animateToRegion(
      {
        latitude,
        longitude,
        latitudeDelta: 0.04,
        longitudeDelta: 0.04,
      },
      350,
    )
  }

  const onMapPress = (e: {
    nativeEvent: { coordinate: { latitude: number; longitude: number } }
  }) => {
    const { latitude, longitude } = e.nativeEvent.coordinate
    fijarDestino(latitude, longitude)
  }

  const proponerRutas = async () => {
    if (!destino) {
      Alert.alert('Destino', 'Tocá el mapa para fijar el destino.')
      return
    }
    setRouting(true)
    Keyboard.dismiss()
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      let from: GeoPoint = { nombre: 'Origen', lat: -33.45, lng: -70.66 }
      if (status === 'granted') {
        const cur = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        from = {
          nombre: 'Origen',
          lat: cur.coords.latitude,
          lng: cur.coords.longitude,
        }
      }
      setOrigen(from)
      const alts = await fetchRutasDriving(
        { latitude: from.lat, longitude: from.lng },
        { latitude: destino.lat, longitude: destino.lng },
        3,
      )
      setOpciones(alts)
      setSel(0)
      const peajes = peajesEnRuta(PEAJES_CATALOGO, alts[0].coords)
      setPeajesSel(peajes)
      fitTo(alts[0].coords, from, destino)
    } catch (e) {
      Alert.alert(
        'Rutas',
        e instanceof Error ? e.message : 'No se pudieron calcular rutas',
      )
    } finally {
      setRouting(false)
    }
  }

  const fitTo = (coords: LatLng[], from: GeoPoint, to: GeoPoint) => {
    const pts = [
      { latitude: from.lat, longitude: from.lng },
      { latitude: to.lat, longitude: to.lng },
      ...coords.filter((_, i) => i % Math.max(1, Math.floor(coords.length / 40)) === 0),
    ]
    mapRef.current?.fitToCoordinates(pts, {
      edgePadding: { top: 60, right: 40, bottom: 80, left: 40 },
      animated: true,
    })
  }

  useEffect(() => {
    if (!opciones[sel]) return
    const peajes = peajesEnRuta(PEAJES_CATALOGO, opciones[sel].coords)
    setPeajesSel(peajes)
    if (origen && destino) fitTo(opciones[sel].coords, origen, destino)
  }, [sel])

  const estSel = useMemo(() => estimadoMotoPeajes(peajesSel), [peajesSel])

  const iniciar = async () => {
    if (!destino || !origen || !opciones[sel]) {
      Alert.alert('Ruta', 'Primero proponé rutas y elegí una.')
      return
    }
    setBusy(true)
    try {
      const elegida = opciones[sel]
      const peajes = peajesEnRuta(PEAJES_CATALOGO, elegida.coords)
      const now = new Date().toISOString()
      const ruta: Ruta = {
        id: newId(),
        nombre: nombre.trim() || `Ruta · ${destLabel.trim() || destino.nombre}`,
        estado: 'en_curso',
        creadaEn: now,
        iniciadaEn: now,
        finalizadaEn: null,
        origen,
        destino: { ...destino, nombre: destLabel.trim() || destino.nombre },
        radioLlegadaMetros: 300,
        rutaPlanificada: elegida.coords,
        peajeIdsRuta: peajes.map((p) => p.id),
        estimadoPeajesMoto: estimadoMotoPeajes(peajes),
        tiempos: tiemposVacios(),
        costos: costosVacios(),
        pausas: [],
        track: [],
        gastos: [],
      }
      await saveRuta(ruta)
      onIniciada(ruta.id)
    } finally {
      setBusy(false)
    }
  }

  const puedeIniciar = Boolean(destino && origen && opciones[sel] && !busy && !routing)

  return (
    <KeyboardAvoidingView
      style={styles.page}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <View style={styles.top}>
          <Pressable onPress={onCancel}>
            <Text style={styles.back}>← Atrás</Text>
          </Pressable>
          <Text style={styles.title}>Armar ruta</Text>

          <Text style={styles.label}>Nombre (opcional)</Text>
          <TextInput
            style={styles.input}
            value={nombre}
            onChangeText={setNombre}
            placeholder="Ej. Copiapó"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
          <Text style={styles.label}>Nombre del destino</Text>
          <TextInput
            style={styles.input}
            value={destLabel}
            onChangeText={setDestLabel}
            placeholder="Destino"
            placeholderTextColor={colors.muted}
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
          <Text style={styles.hint}>
            1) Destino · 2) Proponer rutas · 3) Elegí corredor (al norte: túnel,
            Central o Nororiente)
          </Text>
          {destino ? (
            <Text style={styles.ok}>
              ✓ Destino · {destino.lat.toFixed(4)}, {destino.lng.toFixed(4)}
            </Text>
          ) : (
            <Text style={styles.warn}>Aún no hay destino en el mapa</Text>
          )}
          {opciones[sel] ? (
            <Text style={styles.muted}>
              {peajesSel.length} peajes en la ruta · moto {formatCLP(estSel)} ·{' '}
              {(opciones[sel].distanceM / 1000).toFixed(1)} km ·{' '}
              {formatDuration(opciones[sel].durationSeg)}
            </Text>
          ) : null}
        </View>
      </TouchableWithoutFeedback>

      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{
          latitude: -33.45,
          longitude: -70.66,
          latitudeDelta: 0.25,
          longitudeDelta: 0.25,
        }}
        onPress={onMapPress}
        moveOnMarkerPress={false}
      >
        {opciones.map((op, i) => (
          <Polyline
            key={op.id}
            coordinates={op.coords}
            strokeColor={i === sel ? '#3b82f6' : 'rgba(180,180,180,0.55)'}
            strokeWidth={i === sel ? 5 : 3}
            zIndex={i === sel ? 2 : 1}
            tappable
            onPress={() => setSel(i)}
          />
        ))}
        {peajesSel.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            pinColor="#c45c26"
            title={p.nombre}
            description={`Moto ${formatCLP(p.tarifaMotoNormal)}`}
            tappable={false}
          />
        ))}
        {origen && (
          <Marker
            coordinate={{ latitude: origen.lat, longitude: origen.lng }}
            pinColor="#22c55e"
            title="Origen"
            tappable={false}
          />
        )}
        {destino && (
          <Marker
            coordinate={{ latitude: destino.lat, longitude: destino.lng }}
            pinColor="#3b82f6"
            title={destLabel.trim() || 'Destino'}
            tappable={false}
          />
        )}
      </MapView>

      {opciones.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.alts}
          contentContainerStyle={styles.altsInner}
        >
          {opciones.map((op, i) => {
            const peajes = peajesEnRuta(PEAJES_CATALOGO, op.coords)
            const est = estimadoMotoPeajes(peajes)
            const active = i === sel
            return (
              <Pressable
                key={op.id}
                style={[styles.altChip, active && styles.altChipOn]}
                onPress={() => setSel(i)}
              >
                <Text style={[styles.altTitle, active && styles.altTitleOn]}>
                  {op.label}
                </Text>
                <Text style={styles.altMeta}>
                  {(op.distanceM / 1000).toFixed(1)} km ·{' '}
                  {Math.round(op.durationSeg / 60)} min
                </Text>
                <Text style={styles.altMeta}>
                  {peajes.length} peajes · {formatCLP(est)}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      )}

      <View style={styles.footer}>
        <Pressable
          style={[styles.btnGhost, (!destino || routing) && styles.btnDisabled]}
          onPress={() => void proponerRutas()}
          disabled={!destino || routing}
        >
          <Text style={styles.btnGhostText}>
            {routing ? 'Calculando…' : 'Proponer rutas'}
          </Text>
        </Pressable>
        <Pressable
          style={[styles.btnPrimary, !puedeIniciar && styles.btnDisabled]}
          onPress={() => void iniciar()}
          disabled={!puedeIniciar}
        >
          <Text style={styles.btnPrimaryText}>
            {busy
              ? 'Iniciando…'
              : opciones[sel]
                ? 'Iniciar ruta elegida'
                : 'Elegí una ruta'}
          </Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, paddingTop: 52 },
  top: { paddingHorizontal: 16 },
  back: { color: colors.accent2, marginBottom: 8 },
  title: { color: colors.ink, fontSize: 24, fontWeight: '700', marginBottom: 8 },
  label: { color: colors.muted, marginTop: 6, marginBottom: 4 },
  input: {
    backgroundColor: '#120f0c',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    color: colors.ink,
  },
  hint: { color: colors.muted, marginTop: 8, marginBottom: 4 },
  muted: { color: colors.muted, marginBottom: 4 },
  ok: { color: colors.ok, marginBottom: 4, fontWeight: '600' },
  warn: { color: colors.accent2, marginBottom: 4 },
  map: { flex: 1, marginHorizontal: 12, borderRadius: 14, marginTop: 4 },
  alts: { maxHeight: 88, marginTop: 8 },
  altsInner: { paddingHorizontal: 12, gap: 8 },
  altChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginRight: 8,
    backgroundColor: '#120f0c',
    minWidth: 140,
  },
  altChipOn: {
    borderColor: colors.accent2,
    backgroundColor: '#1c1814',
  },
  altTitle: { color: colors.ink, fontWeight: '700' },
  altTitleOn: { color: colors.accent2 },
  altMeta: { color: colors.muted, marginTop: 2, fontSize: 12 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    backgroundColor: colors.bg,
    gap: 8,
  },
  btnGhost: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: 'center',
  },
  btnGhostText: { color: colors.ink, fontWeight: '600', fontSize: 16 },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnPrimaryText: { color: '#fff8f2', fontWeight: '700', fontSize: 17 },
})
