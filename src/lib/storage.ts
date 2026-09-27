import AsyncStorage from '@react-native-async-storage/async-storage'
import type { Ruta } from '../models/types'

const KEY = 'ruta-viva:rutas'

/** Evita que AsyncStorage explote con tracks/gastos enormes. */
function compactRuta(r: Ruta): Ruta {
  const track = Array.isArray(r.track) ? r.track.slice(-300) : []
  const gastos = Array.isArray(r.gastos) ? r.gastos.slice(-200) : []
  const pausas = Array.isArray(r.pausas) ? r.pausas : []
  const plan = Array.isArray(r.rutaPlanificada)
    ? r.rutaPlanificada.length > 4000
      ? r.rutaPlanificada.filter(
          (_, i) => i % Math.ceil(r.rutaPlanificada!.length / 2000) === 0,
        )
      : r.rutaPlanificada
    : r.rutaPlanificada
  return { ...r, track, gastos, pausas, rutaPlanificada: plan }
}

async function readAll(): Promise<Ruta[]> {
  const raw = await AsyncStorage.getItem(KEY)
  if (!raw) return []
  try {
    const all = JSON.parse(raw) as Ruta[]
    if (!Array.isArray(all)) return []
    return all
  } catch {
    // JSON corrupto: resetear para no quedar atrapado.
    await AsyncStorage.removeItem(KEY)
    return []
  }
}

async function writeAll(all: Ruta[]): Promise<void> {
  const compact = all.map(compactRuta)
  await AsyncStorage.setItem(KEY, JSON.stringify(compact))
}

export async function listRutas(): Promise<Ruta[]> {
  const all = await readAll()
  return all.sort((a, b) => (a.creadaEn < b.creadaEn ? 1 : -1))
}

export async function saveRuta(ruta: Ruta): Promise<void> {
  const all = await readAll()
  const next = compactRuta(ruta)
  const idx = all.findIndex((r) => r.id === next.id)
  if (idx >= 0) all[idx] = next
  else all.unshift(next)
  await writeAll(all)
}

export async function getRuta(id: string): Promise<Ruta | undefined> {
  const all = await listRutas()
  return all.find((r) => r.id === id)
}

export async function getRutaActiva(): Promise<Ruta | undefined> {
  const all = await listRutas()
  return all.find((r) => r.estado === 'en_curso' || r.estado === 'pausada')
}

/** Cierra pausas abiertas y marca finalizada. */
export async function finalizarRuta(id: string): Promise<Ruta | undefined> {
  const all = await readAll()
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
  await writeAll(all)
  return next
}

/** Elimina rutas por id (p. ej. historial seleccionado). */
export async function deleteRutas(ids: string[]): Promise<number> {
  if (!ids.length) return 0
  const remove = new Set(ids)
  const all = await readAll()
  const next = all.filter((r) => !remove.has(r.id))
  const deleted = all.length - next.length
  if (deleted > 0) await writeAll(next)
  return deleted
}

/**
 * Saca todas las rutas en_curso/pausada.
 * modo 'descartar' = borrar; 'finalizar' = pasar a historial.
 */
export async function limpiarRutasPendientes(
  modo: 'descartar' | 'finalizar' = 'descartar',
): Promise<number> {
  const all = await readAll()
  const now = new Date().toISOString()
  let count = 0
  const next: Ruta[] = []
  for (const r of all) {
    if (r.estado !== 'en_curso' && r.estado !== 'pausada') {
      next.push(r)
      continue
    }
    count += 1
    if (modo === 'finalizar') {
      const pausas = (r.pausas ?? []).map((p, i, arr) =>
        i === arr.length - 1 && !p.fin ? { ...p, fin: now } : p,
      )
      next.push({
        ...r,
        pausas,
        track: (r.track ?? []).slice(-100),
        gastos: (r.gastos ?? []).slice(-80),
        estado: 'finalizada',
        finalizadaEn: now,
      })
    }
    // descartar: no se agrega
  }
  if (count > 0) await writeAll(next)
  return count
}
