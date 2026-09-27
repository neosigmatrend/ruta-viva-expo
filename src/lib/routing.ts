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

const OSRM =
  'https://router.project-osrm.org/route/v1/driving/'

function parseOsrmRoutes(json: {
  code?: string
  routes?: {
    distance: number
    duration: number
    geometry: { coordinates: [number, number][] }
  }[]
}): RutaOpcion[] {
  if (json.code !== 'Ok' || !json.routes?.length) {
    throw new Error('No hay ruta vial entre esos puntos')
  }
  return json.routes.map((route, i) => ({
    id: `alt_${i}`,
    label: i === 0 ? 'Ruta principal' : `Alternativa ${i}`,
    coords: route.geometry.coordinates.map(([lng, lat]) => ({
      latitude: lat,
      longitude: lng,
    })),
    distanceM: route.distance,
    durationSeg: Math.round(route.duration),
  }))
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

/** Hasta `maxAlternatives` trazados OSRM (incluye la principal). */
export async function fetchRutasDriving(
  from: LatLng,
  to: LatLng,
  maxAlternatives = 3,
): Promise<RutaOpcion[]> {
  const alts = Math.max(0, maxAlternatives - 1)
  const url =
    `${OSRM}` +
    `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
    `?overview=full&geometries=geojson&alternatives=${alts > 0 ? alts : false}`

  const res = await fetch(url)
  if (!res.ok) throw new Error(`Ruta HTTP ${res.status}`)
  const json = (await res.json()) as {
    code?: string
    routes?: {
      distance: number
      duration: number
      geometry: { coordinates: [number, number][] }
    }[]
  }
  return parseOsrmRoutes(json)
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
