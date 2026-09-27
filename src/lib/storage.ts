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
  // La más reciente en curso/pausada (por si quedó basura vieja).
  return all.find((r) => r.estado === 'en_curso' || r.estado === 'pausada')
}

/** Cierra pausas abiertas y marca finalizada. */
export async function finalizarRuta(id: string): Promise<Ruta | undefined> {
  const all = await listRutas()
  const idx = all.findIndex((r) => r.id === id)
  if (idx < 0) return undefined
  const r = all[idx]
  const now = new Date().toISOString()
  const pausas = (r.pausas ?? []).map((p, i, arr) =>
    i === arr.length - 1 && !p.fin ? { ...p, fin: now } : p,
  )
  const next: Ruta = {
    ...r,
    pausas,
    estado: 'finalizada',
    finalizadaEn: now,
  }
  all[idx] = next
  await AsyncStorage.setItem(KEY, JSON.stringify(all))
  return next
}

/** Elimina rutas por id (p. ej. historial seleccionado). */
export async function deleteRutas(ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const remove = new Set(ids)
  const all = await listRutas()
  const next = all.filter((r) => !remove.has(r.id))
  const deleted = all.length - next.length
  if (deleted > 0) {
    await AsyncStorage.setItem(KEY, JSON.stringify(next))
  }
  return deleted
}
