export type EstadoRuta = 'borrador' | 'en_curso' | 'pausada' | 'finalizada'

export type CategoriaGasto =
  | 'peaje'
  | 'bencina'
  | 'comida'
  | 'alojamiento'
  | 'taller'
  | 'otro'

export interface GeoPoint {
  nombre: string
  lat: number
  lng: number
}

export interface Costos {
  peaje: number
  bencina: number
  comida: number
  alojamiento: number
  taller: number
  otro: number
  total: number
}

export interface Tiempos {
  totalSeg: number
  movimientoSeg: number
  pausasSeg: number
}

export interface Pausa {
  id: string
  inicio: string
  fin: string | null
  lat: number
  lng: number
}

export interface TrackPoint {
  t: string
  lat: number
  lng: number
  velKmh: number
}

export interface Gasto {
  id: string
  categoria: CategoriaGasto
  monto: number
  nombre: string
  lat: number
  lng: number
  fotoUri: string | null
  peajeId: string | null
  automatico: boolean
  creadoEn: string
}

export type AutopistaCodigo =
  | 'TSAC' // Túnel San Cristóbal
  | 'AVNO' // Vespucio Norte
  | 'AVO1'
  | 'AVSU'
  | 'SINS'
  | 'SIOP'
  | 'ACNO'
  | 'AVAM'
  | 'R5_SLV' // Ruta 5 Santiago – Los Vilos (Nueva Aconcagua)
  | 'R5_LVS' // Ruta 5 Los Vilos – La Serena (Elqui)
  | 'R5_VALS' // Ruta 5 La Serena – Vallenar
  | 'R5_VCAL' // Ruta 5 Vallenar – Caldera
  | 'R5_ST' // Ruta 5 Santiago – Talca / Acceso Sur
  | 'R5_TCH' // Ruta 5 Talca – Chillán

/** @deprecated usar AutopistaCodigo */
export type AutopistaUrbana = AutopistaCodigo

export interface PeajeCatalogo {
  id: string
  /** Id interno MOP del punto de cobro, si aplica. */
  mopId?: number
  nombre: string
  autopista: AutopistaCodigo
  lat: number
  lng: number
  radioMetros: number
  /** Tarifa moto 2026 — base fuera de punta (TBFP), CLP. */
  tarifaMotoNormal: number
  /** Tarifa moto 2026 — punta (TBP), CLP. */
  tarifaMotoPunta?: number
  /** Tarifa moto 2026 — saturación (TS), CLP. */
  tarifaMotoSaturacion?: number
  tipo: 'tag' | 'plaza' | 'free_flow'
  sentido?: string
  /** Incluido en estimado urbano Opción A (Ñuñoa → 5 Norte). */
  opcionA?: boolean
  /** Incluido en estimado Ñuñoa → Copiapó (urbano A + 5 Norte). */
  viajeCopiapo?: boolean
  fuenteTarifa?: string
  fuenteCoords?: string
}

export interface RutaCoord {
  latitude: number
  longitude: number
}

export interface Ruta {
  id: string
  nombre: string
  estado: EstadoRuta
  creadaEn: string
  iniciadaEn: string | null
  finalizadaEn: string | null
  origen: GeoPoint | null
  destino: GeoPoint | null
  radioLlegadaMetros: number
  /** Polyline elegida al armar (OSRM). */
  rutaPlanificada?: RutaCoord[] | null
  /** Peajes del catálogo asociados al trazado elegido. */
  peajeIdsRuta?: string[] | null
  /** Estimado moto (tarifa normal) de esos peajes. */
  estimadoPeajesMoto?: number | null
  tiempos: Tiempos
  costos: Costos
  pausas: Pausa[]
  track: TrackPoint[]
  gastos: Gasto[]
}

export const costosVacios = (): Costos => ({
  peaje: 0,
  bencina: 0,
  comida: 0,
  alojamiento: 0,
  taller: 0,
  otro: 0,
  total: 0,
})

export const tiemposVacios = (): Tiempos => ({
  totalSeg: 0,
  movimientoSeg: 0,
  pausasSeg: 0,
})

export function recalcularCostos(gastos: Gasto[]): Costos {
  const c = costosVacios()
  for (const g of gastos) {
    c[g.categoria] += g.monto
    c.total += g.monto
  }
  return c
}
