import { useRef, useState } from 'react'
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
} from 'react-native'
import MapView, { Marker } from 'react-native-maps'
import * as Location from 'expo-location'
import { PEAJES_DEMO } from '../data/peajes-demo'
import { formatCLP, newId } from '../lib/geo'
import { saveRuta } from '../lib/storage'
import {
  costosVacios,
  tiemposVacios,
  type GeoPoint,
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
  const [busy, setBusy] = useState(false)
  const mapRef = useRef<MapView>(null)

  const est = PEAJES_DEMO.reduce((s, p) => s + p.tarifaMotoNormal, 0)

  const fijarDestino = (latitude: number, longitude: number) => {
    Keyboard.dismiss()
    const point: GeoPoint = {
      nombre: destLabel.trim() || 'Destino',
      lat: latitude,
      lng: longitude,
    }
    setDestino(point)
    mapRef.current?.animateToRegion(
      {
        latitude,
        longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
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

  const iniciar = async () => {
    if (!destino) {
      Alert.alert('Destino', 'Tocá el mapa (no el teclado) para fijar el destino.')
      return
    }
    setBusy(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      let origen: GeoPoint = { nombre: 'Origen', lat: -33.45, lng: -70.66 }
      if (status === 'granted') {
        const cur = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        })
        origen = {
          nombre: 'Origen',
          lat: cur.coords.latitude,
          lng: cur.coords.longitude,
        }
      }
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
            placeholder="Ej. Desierto"
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
            Cerrá el teclado y tocá el mapa para fijar el pin azul.
          </Text>
          <Text style={styles.muted}>
            Peajes demo: {PEAJES_DEMO.length} · estimado moto {formatCLP(est)}
          </Text>
          {destino ? (
            <Text style={styles.ok}>
              ✓ Destino fijado · {destino.lat.toFixed(5)}, {destino.lng.toFixed(5)}
            </Text>
          ) : (
            <Text style={styles.warn}>Aún no hay destino en el mapa</Text>
          )}
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
        {PEAJES_DEMO.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            pinColor="#c45c26"
            title={p.nombre}
            description={formatCLP(p.tarifaMotoNormal)}
            tappable={false}
          />
        ))}
        {destino && (
          <Marker
            coordinate={{ latitude: destino.lat, longitude: destino.lng }}
            pinColor="#3b82f6"
            title={destLabel.trim() || 'Destino'}
            tappable={false}
          />
        )}
      </MapView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.btnPrimary, (!destino || busy) && styles.btnDisabled]}
          onPress={() => void iniciar()}
          disabled={!destino || busy}
        >
          <Text style={styles.btnPrimaryText}>
            {busy ? 'Iniciando…' : destino ? 'Iniciar ruta' : 'Fijá destino en el mapa'}
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
  hint: { color: colors.muted, marginTop: 8 },
  muted: { color: colors.muted, marginBottom: 4 },
  ok: { color: colors.ok, marginBottom: 6, fontWeight: '600' },
  warn: { color: colors.accent2, marginBottom: 6 },
  map: { flex: 1, marginHorizontal: 12, borderRadius: 14, marginTop: 4 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    backgroundColor: colors.bg,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.45 },
  btnPrimaryText: { color: '#fff8f2', fontWeight: '700', fontSize: 17 },
})
