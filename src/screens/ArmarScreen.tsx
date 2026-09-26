import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
} from 'react-native'
import MapView, { Marker, type MapPressEvent } from 'react-native-maps'
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

  const est = PEAJES_DEMO.reduce((s, p) => s + p.tarifaMotoNormal, 0)

  const onMapPress = (e: MapPressEvent) => {
    const { latitude, longitude } = e.nativeEvent.coordinate
    setDestino({
      nombre: destLabel.trim() || 'Destino',
      lat: latitude,
      lng: longitude,
    })
  }

  const iniciar = async () => {
    if (!destino) {
      Alert.alert('Destino', 'Tocá el mapa para fijar el destino.')
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
        radioLlegadaMetros: 200,
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
    <View style={styles.page}>
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
      />
      <Text style={styles.label}>Nombre del destino</Text>
      <TextInput
        style={styles.input}
        value={destLabel}
        onChangeText={setDestLabel}
        placeholder="Destino"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.hint}>Tocá el mapa para fijar el destino.</Text>
      <Text style={styles.muted}>
        Peajes demo: {PEAJES_DEMO.length} · estimado moto {formatCLP(est)}
      </Text>

      <MapView
        style={styles.map}
        initialRegion={{
          latitude: -33.45,
          longitude: -70.66,
          latitudeDelta: 0.25,
          longitudeDelta: 0.25,
        }}
        onPress={onMapPress}
      >
        {PEAJES_DEMO.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            pinColor="#c45c26"
            title={p.nombre}
            description={formatCLP(p.tarifaMotoNormal)}
          />
        ))}
        {destino && (
          <Marker
            coordinate={{ latitude: destino.lat, longitude: destino.lng }}
            pinColor="#3b82f6"
            title={destino.nombre}
          />
        )}
      </MapView>

      <Pressable
        style={[styles.btnPrimary, busy && { opacity: 0.6 }]}
        onPress={() => void iniciar()}
        disabled={busy}
      >
        <Text style={styles.btnPrimaryText}>
          {busy ? 'Iniciando…' : 'Iniciar ruta'}
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg, padding: 16, paddingTop: 52 },
  back: { color: colors.accent2, marginBottom: 8 },
  title: { color: colors.ink, fontSize: 24, fontWeight: '700', marginBottom: 12 },
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
  muted: { color: colors.muted, marginBottom: 8 },
  map: { flex: 1, minHeight: 220, borderRadius: 14, marginVertical: 10 },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff8f2', fontWeight: '700', fontSize: 17 },
})
