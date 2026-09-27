import type { Ruta, RutaCoord, SentidoViaje } from '../models/types'
import { sentidoDeRuta } from '../models/types'

export type TrazoMacro = {
  rutaId: string
  nombre: string
  sentido: SentidoViaje
  /** 'track' = GPS real; 'plan' = polyline al armar. */
  fuente: 'track' | 'plan'
  coords: RutaCoord[]
}

/** Prefiere track GPS; si no hay, usa la ruta planificada OSRM. */
export function trazoDeRuta(r: Ruta): TrazoMacro | null {
  const track = (r.track ?? [])
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .map((p) => ({ latitude: p.lat, longitude: p.lng }))
  if (track.length >= 2) {
    return {
      rutaId: r.id,
      nombre: r.nombre,
      sentido: sentidoDeRuta(r),
      fuente: 'track',
      coords: track,
    }
  }
  const plan = (r.rutaPlanificada ?? []).filter(
    (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude),
  )
  if (plan.length >= 2) {
    return {
      rutaId: r.id,
      nombre: r.nombre,
      sentido: sentidoDeRuta(r),
      fuente: 'plan',
      coords: plan,
    }
  }
  return null
}

/** Orden cronológico (más antigua primero) para el mapa del viaje. */
export function ordenarRutasViaje(rutas: Ruta[]): Ruta[] {
  return [...rutas].sort((a, b) => {
    const ta = a.finalizadaEn || a.creadaEn
    const tb = b.finalizadaEn || b.creadaEn
    return ta < tb ? -1 : ta > tb ? 1 : 0
  })
}

export function todosLosPuntos(trazos: TrazoMacro[]): RutaCoord[] {
  const out: RutaCoord[] = []
  for (const t of trazos) out.push(...t.coords)
  return out
}
