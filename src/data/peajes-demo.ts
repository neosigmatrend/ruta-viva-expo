import type { PeajeCatalogo } from '../models/types'

/**
 * Catálogo urbano Opción A: Ñuñoa → Túnel San Cristóbal → Vespucio Norte → 5 Norte.
 *
 * Tarifas: MOP Tarifas Urbanas 2026 (motos), hoja TSAC / AVNO.
 * Coordenadas: OpenStreetMap highway=toll_gantry (refs P101/P102/P15/P13/P11).
 */
export const PEAJES_CATALOGO: PeajeCatalogo[] = [
  {
    id: 'tsac_p102_kennedy_el_salto',
    mopId: 242,
    nombre: 'Túnel San Cristóbal · Kennedy → El Salto',
    autopista: 'TSAC',
    lat: -33.3988,
    lng: -70.615132,
    radioMetros: 100,
    tarifaMotoNormal: 565,
    tarifaMotoPunta: 904,
    tarifaMotoSaturacion: 1131,
    tipo: 'free_flow',
    sentido: 'Kennedy → El Salto',
    opcionA: true,
    fuenteTarifa: 'MOP Tarifas Urbanas 2026 · TSAC Eje C1',
    fuenteCoords: 'OSM P102 / PC 102',
  },
  {
    id: 'tsac_p101_el_salto_kennedy',
    mopId: 243,
    nombre: 'Túnel San Cristóbal · El Salto → Kennedy',
    autopista: 'TSAC',
    lat: -33.398616,
    lng: -70.615725,
    radioMetros: 100,
    tarifaMotoNormal: 452,
    tarifaMotoPunta: 678,
    tipo: 'free_flow',
    sentido: 'El Salto → Kennedy',
    opcionA: false,
    fuenteTarifa: 'MOP Tarifas Urbanas 2026 · TSAC Eje C2',
    fuenteCoords: 'OSM P101 / PC 101',
  },
  {
    id: 'avno_p15_el_salto_recoleta',
    mopId: 204,
    nombre: 'Vespucio Norte · P15 El Salto → Recoleta',
    autopista: 'AVNO',
    lat: -33.388664,
    lng: -70.632967,
    radioMetros: 110,
    tarifaMotoNormal: 141,
    tarifaMotoPunta: 281,
    tarifaMotoSaturacion: 422,
    tipo: 'free_flow',
    sentido: 'Oriente → Poniente',
    opcionA: true,
    fuenteTarifa: 'MOP Tarifas Urbanas 2026 · AVNO',
    fuenteCoords: 'OSM P15',
  },
  {
    id: 'avno_p13_recoleta_fontova',
    mopId: 205,
    nombre: 'Vespucio Norte · P13 Recoleta → Pedro Fontova',
    autopista: 'AVNO',
    lat: -33.373364,
    lng: -70.664615,
    radioMetros: 110,
    tarifaMotoNormal: 412,
    tarifaMotoPunta: 824,
    tarifaMotoSaturacion: 1236,
    tipo: 'free_flow',
    sentido: 'Oriente → Poniente',
    opcionA: true,
    fuenteTarifa: 'MOP Tarifas Urbanas 2026 · AVNO',
    fuenteCoords: 'OSM P13',
  },
  {
    id: 'avno_p11_fontova_ruta5',
    mopId: 206,
    nombre: 'Vespucio Norte · P11 Pedro Fontova → Ruta 5 Norte',
    autopista: 'AVNO',
    lat: -33.365821,
    lng: -70.695114,
    radioMetros: 110,
    tarifaMotoNormal: 301,
    tarifaMotoPunta: 603,
    tipo: 'free_flow',
    sentido: 'Oriente → Poniente',
    opcionA: true,
    fuenteTarifa: 'MOP Tarifas Urbanas 2026 · AVNO',
    fuenteCoords: 'OSM P11',
  },
]

/** Alias usado por pantallas: catálogo activo detectable por GPS. */
export const PEAJES_DEMO = PEAJES_CATALOGO

/** Peajes del corredor urbano Opción A (estimado al armar ruta). */
export const PEAJES_OPCION_A = PEAJES_CATALOGO.filter((p) => p.opcionA)

export const estimadoMotoOpcionANormal = (): number =>
  PEAJES_OPCION_A.reduce((s, p) => s + p.tarifaMotoNormal, 0)
