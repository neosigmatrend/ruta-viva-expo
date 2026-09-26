export function zoomPorVelocidad(velKmh: number, pausada: boolean): number {
  // delta lat/lng approx for react-native-maps latitudeDelta
  if (pausada || velKmh < 8) return 0.008
  if (velKmh < 35) return 0.02
  if (velKmh < 70) return 0.045
  if (velKmh < 110) return 0.08
  return 0.14
}

export function bearingEntre(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const φ1 = toRad(lat1)
  const φ2 = toRad(lat2)
  const Δλ = toRad(lng2 - lng1)
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

export function rumboDesdeTrack(
  track: { lat: number; lng: number }[],
): number | null {
  if (track.length < 2) return null
  const a = track[track.length - 2]
  const b = track[track.length - 1]
  if (Math.abs(a.lat - b.lat) < 0.00005 && Math.abs(a.lng - b.lng) < 0.00005) {
    return null
  }
  return bearingEntre(a.lat, a.lng, b.lat, b.lng)
}
