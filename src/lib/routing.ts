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

/** Corredores urbanos forzados cuando OSRM no entrega alternativas (viajes largos). */
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
    // Los Leones → Santa María → Costanera oriente → Salida 9 → Nororiente → R5.
    // Vias pensadas para no meterse al poniente (Vivaceta / Bellavista).
    id: 'norte_nororiente',
    label: 'Costanera + Autopista Nororiente',
    vias: [
      { latitude: -33.4257, longitude: -70.604 }, // Los Leones
      { latitude: -33.4125, longitude: -70.605 }, // Kennedy / Costanera
      { latitude: -33.3945, longitude: -70.6035 }, // Centenario (P2.2)
      { latitude: -33.3888, longitude: -70.6019 }, // Salida 9 → Nororiente
      { latitude: -33.33, longitude: -70.626 }, // Nororiente mid
      { latitude: -33.305, longitude: -70.66 }, // Nororiente → R5
      { latitude: -33.285, longitude: -70.735 }, // R5 Norte
    ],
  },
]

const CORREDORES_SUR: { id: string; label: string; vias: LatLng[] }[] = [
  {
    id: 'sur_acceso_sur',
    label: 'Acceso Sur + 5 Sur',
    vias: [
      { latitude: -33.58, longitude: -70.61 }, // Acceso Sur / La Pintana
      { latitude: -33.91, longitude: -70.73 }, // Angostura
    ],
  },
  {
    id: 'sur_central',
    label: 'Autopista Central + 5 Sur',
    vias: [
      { latitude: -33.5, longitude: -70.68 },
      { latitude: -33.7, longitude: -70.72 },
    ],
  },
  {
    id: 'sur_vespucio',
    label: 'Vespucio Sur + Acceso Sur',
    vias: [
      { latitude: -33.52, longitude: -70.6 },
      { latitude: -33.58, longitude: -70.61 },
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

/** Destino al sur (Chillán / Talca / etc.). */
function viajeAlSur(from: LatLng, to: LatLng): boolean {
  if (!enSantiagoMetro(from)) return false
  return to.latitude < -34.2 || from.latitude - to.latitude > 0.25
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
 * corredores urbanos (túnel/Vespucio, Central, Autopista Nororiente) con waypoints.
 */
export async function fetchRutasDriving(
  from: LatLng,
  to: LatLng,
  maxAlternatives = 3,
): Promise<RutaOpcion[]> {
  const out: RutaOpcion[] = []
  const alNorte = viajeAlNorte(from, to)
  const alSur = !alNorte && viajeAlSur(from, to)
  const corredores = alNorte
    ? CORREDORES_NORTE
    : alSur
      ? CORREDORES_SUR
      : []

  if (corredores.length) {
    const settled = await Promise.allSettled(
      corredores.map(async (c) => {
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

  const nativeAlts = corredores.length ? 0 : Math.max(0, maxAlternatives - 1)
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
      if (out.some((o) => casiIguales(o, cand))) return
      out.push(cand)
    })
  } catch (e) {
    if (out.length === 0) throw e
  }

  if (out.length === 0) {
    throw new Error('No hay ruta vial entre esos puntos')
  }

  return out.slice(0, corredores.length ? 4 : Math.max(maxAlternatives, 3))
}

function distPuntoASegmentoMetros(p: LatLng, a: LatLng, b: LatLng): number {
  const midLat = ((a.latitude + b.latitude) / 2) * (Math.PI / 180)
  const x = (lng: number) => (lng - a.longitude) * Math.cos(midLat) * 111320
  const y = (lat: number) => (lat - a.latitude) * 110540
  const ax = 0
  const ay = 0
  const bx = x(b.longitude)
  const by = y(b.latitude)
  const px = x(p.longitude)
  const py = y(p.latitude)
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Distancia mínima del punto al polyline (a segmentos, no solo vértices).
 * Barrido grueso + refinamiento local.
 */
export function distanciaARutaMetros(punto: LatLng, ruta: LatLng[]): number {
  if (ruta.length === 0) return Infinity
  if (ruta.length === 1) {
    return distanciaMetros(
      punto.latitude,
      punto.longitude,
      ruta[0].latitude,
      ruta[0].longitude,
    )
  }
  const coarse = Math.max(1, Math.floor(ruta.length / 100))
  let min = Infinity
  let bestIdx = 0
  for (let i = 0; i < ruta.length - 1; i += coarse) {
    const j = Math.min(i + coarse, ruta.length - 1)
    const d = distPuntoASegmentoMetros(punto, ruta[i], ruta[j])
    if (d < min) {
      min = d
      bestIdx = i
    }
  }
  const from = Math.max(0, bestIdx - coarse * 3)
  const to = Math.min(ruta.length - 2, bestIdx + coarse * 3)
  for (let i = from; i <= to; i++) {
    const d = distPuntoASegmentoMetros(punto, ruta[i], ruta[i + 1])
    if (d < min) min = d
  }
  return min
}

/** Índice del vértice de ruta más cercano al peaje. */
function indiceCercano(punto: LatLng, ruta: LatLng[]): number {
  let best = 0
  let min = Infinity
  const coarse = Math.max(1, Math.floor(ruta.length / 100))
  for (let i = 0; i < ruta.length; i += coarse) {
    const d = distanciaMetros(
      punto.latitude,
      punto.longitude,
      ruta[i].latitude,
      ruta[i].longitude,
    )
    if (d < min) {
      min = d
      best = i
    }
  }
  const from = Math.max(0, best - coarse * 3)
  const to = Math.min(ruta.length - 1, best + coarse * 3)
  for (let i = from; i <= to; i++) {
    const d = distanciaMetros(
      punto.latitude,
      punto.longitude,
      ruta[i].latitude,
      ruta[i].longitude,
    )
    if (d < min) {
      min = d
      best = i
    }
  }
  return best
}

type SentidoViaje = 'ascendente' | 'descendente' | 'ambos'

/**
 * Convención MOP en ejes N–S (Ruta 5, Central, Nororiente…):
 * ascendente = norte→sur; descendente = sur→norte.
 * En Costanera (SIOP, eje E–O): ascendente = oriente→poniente;
 * descendente = poniente→oriente.
 */
function sentidoViajeEnPunto(
  autopista: PeajeCatalogo['autopista'],
  ruta: LatLng[],
  idx: number,
): SentidoViaje {
  const a = ruta[idx]
  let b = a
  let acc = 0
  for (let i = idx + 1; i < ruta.length && acc < 280; i++) {
    acc += distanciaMetros(
      b.latitude,
      b.longitude,
      ruta[i].latitude,
      ruta[i].longitude,
    )
    b = ruta[i]
  }
  if (acc < 40 && idx > 0) {
    // al final del trazo: mirar hacia atrás e invertir
    let prev = a
    let back = 0
    for (let i = idx - 1; i >= 0 && back < 280; i--) {
      back += distanciaMetros(
        prev.latitude,
        prev.longitude,
        ruta[i].latitude,
        ruta[i].longitude,
      )
      prev = ruta[i]
    }
    const dLat = a.latitude - prev.latitude
    const dLng = a.longitude - prev.longitude
    return sentidoDesdeDelta(autopista, dLat, dLng)
  }
  const dLat = b.latitude - a.latitude
  const dLng = b.longitude - a.longitude
  return sentidoDesdeDelta(autopista, dLat, dLng)
}

function sentidoDesdeDelta(
  autopista: PeajeCatalogo['autopista'],
  dLat: number,
  dLng: number,
): SentidoViaje {
  if (Math.abs(dLat) < 1e-8 && Math.abs(dLng) < 1e-8) return 'ambos'

  // Ejes oriente–poniente (Costanera Norte).
  if (autopista === 'SIOP') {
    if (Math.abs(dLng) >= Math.abs(dLat) * 0.35) {
      return dLng < 0 ? 'ascendente' : 'descendente'
    }
    // tramo casi N–S en Costanera oriente: hacia el norte ≈ hacia el oriente de la concesión
    return dLat > 0 ? 'descendente' : 'ascendente'
  }

  // Túnel: Kennedy→El Salto es hacia el norte (El Salto).
  if (autopista === 'TSAC') {
    return dLat > 0 ? 'ascendente' : 'descendente'
  }

  // Resto (R5, Central, AVNO, ACNO, AVSU…): N→S = ascendente.
  if (Math.abs(dLat) >= Math.abs(dLng) * 0.25) {
    return dLat < 0 ? 'ascendente' : 'descendente'
  }
  // tramo más E–O: poniente (↓lng) en Nororiente hacia R5 ≈ ascendente
  if (autopista === 'ACNO') {
    return dLng < 0 ? 'ascendente' : 'descendente'
  }
  return dLat < 0 ? 'ascendente' : 'descendente'
}

function etiquetaSentido(s?: string): SentidoViaje {
  const t = (s || '').toLowerCase()
  if (!t || t.includes('ambos')) return 'ambos'
  if (t.includes('descendente')) return 'descendente'
  if (t.includes('ascendente')) return 'ascendente'
  // Códigos electrónicos MOP: PP1NS = norte→sur, PP1SN = sur→norte.
  if (/pp\d*sn/.test(t) || /sur\s*[→\-|].*norte/.test(t)) return 'descendente'
  if (/pp\d*ns/.test(t) || /norte\s*[→\-|].*sur/.test(t)) return 'ascendente'
  // Nombres tipo "Kennedy → El Salto" (TSAC).
  if (t.includes('kennedy') && t.includes('salto')) {
    return t.indexOf('kennedy') < t.indexOf('salto')
      ? 'ascendente'
      : 'descendente'
  }
  // Etiquetas cortas N→S / S→N en el nombre mostrado.
  if (t.includes('n→s') || t.includes('n->s')) return 'ascendente'
  if (t.includes('s→n') || t.includes('s->n')) return 'descendente'
  return 'ambos'
}

function peajeCoincideSentido(
  peaje: PeajeCatalogo,
  viaje: SentidoViaje,
): boolean {
  const peajeSentido = etiquetaSentido(
    `${peaje.sentido || ''} ${peaje.nombre || ''}`,
  )
  if (viaje === 'ambos' || peajeSentido === 'ambos') return true
  return peajeSentido === viaje
}

/**
 * Peajes del catálogo cercanos al trazado, solo en el sentido del viaje.
 * Deduplica pórticos opuestos / plaza+electrónico en la misma celda.
 */
export function peajesEnRuta(
  catalogo: PeajeCatalogo[],
  ruta: LatLng[],
  margenExtraM = 90,
): PeajeCatalogo[] {
  if (ruta.length === 0) return []
  const hits = catalogo.filter((p) => {
    const d = distanciaARutaMetros(
      { latitude: p.lat, longitude: p.lng },
      ruta,
    )
    if (d > p.radioMetros + margenExtraM) return false
    const idx = indiceCercano({ latitude: p.lat, longitude: p.lng }, ruta)
    const viaje = sentidoViajeEnPunto(p.autopista, ruta, idx)
    return peajeCoincideSentido(p, viaje)
  })

  // Una entrada por celda ~110 m (evita cobro doble plaza/electrónico u opuestos).
  const byCell = new Map<string, PeajeCatalogo>()
  for (const p of hits) {
    const key = `${p.autopista}:${p.lat.toFixed(3)},${p.lng.toFixed(3)}`
    const prev = byCell.get(key)
    if (!prev) {
      byCell.set(key, p)
      continue
    }
    // Preferir free_flow con sentido explícito y nombre corto/legible.
    const score = (x: PeajeCatalogo) => {
      const s = (x.sentido || '').toLowerCase()
      let n = 0
      if (x.tipo === 'free_flow') n += 2
      if (s.includes('ascendente') || s.includes('descendente')) n += 2
      if (s.includes('ambos')) n += 1
      if (!/pp\d|rdm-|pórtico troncal/i.test(x.nombre)) n += 1
      n -= x.nombre.length / 500
      return n
    }
    if (score(p) > score(prev)) byCell.set(key, p)
  }
  return [...byCell.values()]
}

export function estimadoMotoPeajes(peajes: PeajeCatalogo[]): number {
  return peajes.reduce((s, p) => s + p.tarifaMotoNormal, 0)
}
