import type { PeajeCatalogo } from '../models/types'
import { distanciaMetros } from './geo'

export type LatLng = { latitude: number; longitude: number }

export type RutaOpcion = {
  id: string
  label: string
  coords: LatLng[]
  distanceM: number
  durationSeg: number
}

const OSRM = 'https://router.project-osrm.org/route/v1/driving/'

/** Corredores urbanos forzados cuando OSRM no entrega alternativas (viajes largos al norte). */
const CORREDORES_NORTE: { id: string; label: string; vias: LatLng[] }[] = [
  {
    id: 'norte_tunel_vespucio',
    label: 'Túnel + Vespucio Norte',
    vias: [
      { latitude: -33.3988, longitude: -70.6151 }, // Túnel / El Salto
      { latitude: -33.3658, longitude: -70.6951 }, // Empalme Ruta 5
    ],
  },
  {
    id: 'norte_central',
    label: 'Autopista Central',
    vias: [
      { latitude: -33.42, longitude: -70.68 },
      { latitude: -33.28, longitude: -70.735 }, // Central norte
    ],
  },
  {
    id: 'norte_nororiente',
    label: 'Acceso Nororiente',
    vias: [
      { latitude: -33.36, longitude: -70.58 },
      { latitude: -33.2, longitude: -70.7 }, // Colina / 5 Norte
    ],
  },
]

function enSantiagoMetro(p: LatLng): boolean {
  return (
    p.latitude < -33.2 &&
    p.latitude > -33.75 &&
    p.longitude > -71.0 &&
    p.longitude < -70.4
  )
}

/** Destino claramente al norte (sale de la RM hacia el norte). */
function viajeAlNorte(from: LatLng, to: LatLng): boolean {
  if (!enSantiagoMetro(from)) return false
  // Copiapó / La Serena / etc., o al menos ~20 km al norte
  return to.latitude > -33.05 || to.latitude - from.latitude > 0.18
}

function coordsFromGeometry(geometry: {
  coordinates: [number, number][]
}): LatLng[] {
  return geometry.coordinates.map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }))
}

async function osrmRoute(
  points: LatLng[],
  alternatives = 0,
): Promise<
  {
    distance: number
    duration: number
    geometry: { coordinates: [number, number][] }
  }[]
> {
  const path = points.map((p) => `${p.longitude},${p.latitude}`).join(';')
  const altParam =
    alternatives > 0 ? `&alternatives=${alternatives}` : '&alternatives=false'
  const url = `${OSRM}${path}?overview=full&geometries=geojson${altParam}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Ruta HTTP ${res.status}`)
  const json = (await res.json()) as {
    code?: string
    message?: string
    routes?: {
      distance: number
      duration: number
      geometry: { coordinates: [number, number][] }
    }[]
  }
  if (json.code !== 'Ok' || !json.routes?.length) {
    throw new Error(json.message || 'No hay ruta vial entre esos puntos')
  }
  return json.routes
}

/** Casi la misma ruta (solo para descartar duplicados obvios). */
function casiIguales(a: RutaOpcion, b: RutaOpcion): boolean {
  const dDist = Math.abs(a.distanceM - b.distanceM) / Math.max(a.distanceM, 1)
  const dDur =
    Math.abs(a.durationSeg - b.durationSeg) / Math.max(a.durationSeg, 1)
  return dDist < 0.004 && dDur < 0.004
}

/** Una ruta (compat). */
export async function fetchRutaDriving(
  from: LatLng,
  to: LatLng,
): Promise<{ coords: LatLng[]; distanceM: number; durationSeg: number }> {
  const [first] = await fetchRutasDriving(from, to, 1)
  return {
    coords: first.coords,
    distanceM: first.distanceM,
    durationSeg: first.durationSeg,
  }
}

/**
 * Propone rutas: alternativas nativas OSRM +, si vas al norte desde Santiago,
 * corredores urbanos (túnel/Vespucio, Central, Nororiente) con waypoints.
 */
export async function fetchRutasDriving(
  from: LatLng,
  to: LatLng,
  maxAlternatives = 3,
): Promise<RutaOpcion[]> {
  const out: RutaOpcion[] = []
  const alNorte = viajeAlNorte(from, to)

  // Al norte: primero corredores con nombre (OSRM largo casi no da alternativas).
  if (alNorte) {
    const settled = await Promise.allSettled(
      CORREDORES_NORTE.map(async (c) => {
        const routes = await osrmRoute([from, ...c.vias, to], 0)
        const route = routes[0]
        return {
          id: c.id,
          label: c.label,
          coords: coordsFromGeometry(route.geometry),
          distanceM: route.distance,
          durationSeg: Math.round(route.duration),
        } satisfies RutaOpcion
      }),
    )
    for (const s of settled) {
      if (s.status !== 'fulfilled') continue
      const cand = s.value
      if (out.some((o) => casiIguales(o, cand))) continue
      out.push(cand)
    }
  }

  const nativeAlts = alNorte ? 0 : Math.max(0, maxAlternatives - 1)
  try {
    const routes = await osrmRoute([from, to], nativeAlts)
    routes.forEach((route, i) => {
      const cand: RutaOpcion = {
        id: `osrm_${i}`,
        label: i === 0 ? 'Ruta sugerida' : `Alternativa ${i}`,
        coords: coordsFromGeometry(route.geometry),
        distanceM: route.distance,
        durationSeg: Math.round(route.duration),
      }
      // No duplicar la sugerencia OSRM si ya es un corredor norte.
      if (out.some((o) => casiIguales(o, cand))) return
      out.push(cand)
    })
  } catch (e) {
    if (out.length === 0) throw e
  }

  if (out.length === 0) {
    throw new Error('No hay ruta vial entre esos puntos')
  }

  return out.slice(0, alNorte ? 4 : Math.max(maxAlternatives, 3))
}

/** Distancia mínima del punto a cualquier vértice del polyline (aprox.). */
export function distanciaARutaMetros(punto: LatLng, ruta: LatLng[]): number {
  if (ruta.length === 0) return Infinity
  let min = Infinity
  const step = Math.max(1, Math.floor(ruta.length / 120))
  for (let i = 0; i < ruta.length; i += step) {
    const p = ruta[i]
    const d = distanciaMetros(
      punto.latitude,
      punto.longitude,
      p.latitude,
      p.longitude,
    )
    if (d < min) min = d
  }
  const last = ruta[ruta.length - 1]
  const dLast = distanciaMetros(
    punto.latitude,
    punto.longitude,
    last.latitude,
    last.longitude,
  )
  return Math.min(min, dLast)
}

/**
 * Peajes del catálogo cercanos al trazado.
 * `margenExtraM` se suma al radio propio del peaje.
 */
export function peajesEnRuta(
  catalogo: PeajeCatalogo[],
  ruta: LatLng[],
  margenExtraM = 120,
): PeajeCatalogo[] {
  if (ruta.length === 0) return []
  return catalogo.filter((p) => {
    const d = distanciaARutaMetros(
      { latitude: p.lat, longitude: p.lng },
      ruta,
    )
    return d <= p.radioMetros + margenExtraM
  })
}

export function estimadoMotoPeajes(peajes: PeajeCatalogo[]): number {
  return peajes.reduce((s, p) => s + p.tarifaMotoNormal, 0)
}
