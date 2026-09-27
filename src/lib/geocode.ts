import * as Location from 'expo-location'

export type GeocodeHit = {
  lat: number
  lng: number
  label: string
}

/**
 * Busca una dirección/ciudad. Prioriza el geocoder nativo;
 * si no hay resultados, usa Nominatim (Chile).
 */
export async function buscarDireccion(query: string): Promise<GeocodeHit[]> {
  const q = query.trim()
  if (q.length < 2) return []

  try {
    const native = await Location.geocodeAsync(q)
    if (native.length) {
      const hits: GeocodeHit[] = []
      for (const n of native.slice(0, 5)) {
        let label = q
        try {
          const rev = await Location.reverseGeocodeAsync({
            latitude: n.latitude,
            longitude: n.longitude,
          })
          const a = rev[0]
          if (a) {
            label =
              [a.street, a.streetNumber, a.city || a.subregion, a.region]
                .filter(Boolean)
                .join(', ') || q
          }
        } catch {
          /* keep query as label */
        }
        hits.push({ lat: n.latitude, lng: n.longitude, label })
      }
      if (hits.length) return hits
    }
  } catch {
    /* fallback Nominatim */
  }

  return buscarNominatim(q)
}

async function buscarNominatim(q: string): Promise<GeocodeHit[]> {
  const params = new URLSearchParams({
    q,
    format: 'json',
    addressdetails: '0',
    limit: '5',
    countrycodes: 'cl',
  })
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        'User-Agent': 'RutaViva/1.5 (moto trip app; contacto@ruta-viva.local)',
        Accept: 'application/json',
      },
    },
  )
  if (!res.ok) throw new Error(`Geocoder HTTP ${res.status}`)
  const json = (await res.json()) as {
    lat: string
    lon: string
    display_name: string
  }[]
  return json.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lon),
    label: r.display_name,
  }))
}
