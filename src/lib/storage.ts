import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Ruta } from '../models/types'

const KEY = 'ruta-viva:rutas'

export async function listRutas(): Promise<Ruta[]> {
  const raw = await AsyncStorage.getItem(KEY)
  if (!raw) return []
  try {
    const all = JSON.parse(raw) as Ruta[]
    return all.sort((a, b) => (a.creadaEn < b.creadaEn ? 1 : -1))
  } catch {
    return []
  }
}

export async function saveRuta(ruta: Ruta): Promise<void> {
  const all = await listRutas()
  const idx = all.findIndex((r) => r.id === ruta.id)
  if (idx >= 0) all[idx] = ruta
  else all.unshift(ruta)
  await AsyncStorage.setItem(KEY, JSON.stringify(all))
}

export async function getRuta(id: string): Promise<Ruta | undefined> {
  const all = await listRutas()
  return all.find((r) => r.id === id)
}

export async function getRutaActiva(): Promise<Ruta | undefined> {
  const all = await listRutas()
  return all.find((r) => r.estado === 'en_curso' || r.estado === 'pausada')
}
