import { distanciaMetros } from './geo'

export type LatLng = { latitude: number; longitude: number }

/** Ruta en calles (OSRM público). Devuelve puntos + distancia metros. */
export async function fetchRutaDriving(
  from: LatLng,
  to: LatLng,
): Promise<{ coords: LatLng[]; distanceM: number; durationSeg: number }> {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${from.longitude},${from.latitude};${to.longitude},${to.latitude}` +
    `?overview=full&geometries=geojson`

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
  if (json.code !== 'Ok' || !json.routes?.[0]) {
    throw new Error('No hay ruta vial entre esos puntos')
  }
  const route = json.routes[0]
  const coords = route.geometry.coordinates.map(([lng, lat]) => ({
    latitude: lat,
    longitude: lng,
  }))
  return {
    coords,
    distanceM: route.distance,
    durationSeg: Math.round(route.duration),
  }
}

/** Distancia mínima del punto a cualquier vértice del polyline (aprox. off-route). */
export function distanciaARutaMetros(punto: LatLng, ruta: LatLng[]): number {
  if (ruta.length === 0) return Infinity
  let min = Infinity
  // muestreo para no recorrer 10k puntos cada vez
  const step = Math.max(1, Math.floor(ruta.length / 80))
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
  // también el último
  const last = ruta[ruta.length - 1]
  const dLast = distanciaMetros(
    punto.latitude,
    punto.longitude,
    last.latitude,
    last.longitude,
  )
  return Math.min(min, dLast)
}
