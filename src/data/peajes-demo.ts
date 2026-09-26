import type { PeajeCatalogo } from '../models/types'

export const PEAJES_DEMO: PeajeCatalogo[] = [
  {
    id: 'peaje_demo_1',
    nombre: 'Peaje Demo Norte',
    lat: -33.398,
    lng: -70.648,
    radioMetros: 120,
    tarifaMotoNormal: 800,
    tipo: 'tag',
  },
  {
    id: 'peaje_demo_2',
    nombre: 'Peaje Demo Centro',
    lat: -33.437,
    lng: -70.65,
    radioMetros: 120,
    tarifaMotoNormal: 900,
    tipo: 'tag',
  },
  {
    id: 'peaje_demo_3',
    nombre: 'Peaje Demo Sur',
    lat: -33.48,
    lng: -70.652,
    radioMetros: 120,
    tarifaMotoNormal: 1100,
    tipo: 'free_flow',
  },
  {
    id: 'peaje_demo_4',
    nombre: 'Peaje Demo Poniente',
    lat: -33.45,
    lng: -70.72,
    radioMetros: 120,
    tarifaMotoNormal: 1000,
    tipo: 'plaza',
  },
  {
    id: 'peaje_demo_5',
    nombre: 'Peaje Demo Oriente',
    lat: -33.42,
    lng: -70.58,
    radioMetros: 120,
    tarifaMotoNormal: 850,
    tipo: 'tag',
  },
]
