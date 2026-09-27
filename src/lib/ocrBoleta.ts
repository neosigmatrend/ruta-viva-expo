import * as FileSystem from 'expo-file-system/legacy'
import * as ImageManipulator from 'expo-image-manipulator'

/** Extrae candidatos de monto CLP desde texto OCR de boleta/voucher. */
export function parseMontosCLP(texto: string): number[] {
  const encontrados = new Set<number>()
  const upper = texto.toUpperCase().replace(/[|]/g, 'I')

  const patterns = [
    /(?:TOTAL(?:\s*A\s*PAGAR)?|SUB[\s-]?TOTAL|NETO|IVA|MONTO|PAGO|VALOR)\s*[:$]?\s*\$?\s*([\d.]+(?:,\d{1,2})?)/g,
    /\$\s*([\d.]+(?:,\d{1,2})?)/g,
  ]

  for (const re of patterns) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(upper))) {
      const n = normalizarMonto(m[1])
      if (n != null) encontrados.add(n)
    }
  }

  for (const m of upper.matchAll(/\b(\d{1,3}(?:\.\d{3}){1,3}|\d{4,7})\b/g)) {
    const n = normalizarMonto(m[1])
    if (n != null && n >= 100) encontrados.add(n)
  }

  return [...encontrados].sort((a, b) => b - a)
}

export function preferirTotal(
  texto: string,
  candidatos: number[],
): number | null {
  const upper = texto.toUpperCase()
  const m = upper.match(
    /TOTAL(?:\s*A\s*PAGAR)?\s*[:$]?\s*\$?\s*([\d.\s]+)/,
  )
  if (m) {
    const n = normalizarMonto(m[1].replace(/\s/g, ''))
    if (n != null) return n
  }
  return candidatos[0] ?? null
}

function normalizarMonto(raw: string): number | null {
  let s = raw.trim().replace(/\s/g, '')
  if (!s) return null
  if (s.includes(',') && s.includes('.')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (s.includes(',')) {
    const parts = s.split(',')
    s =
      parts[1]?.length === 2
        ? `${parts[0].replace(/\./g, '')}.${parts[1]}`
        : s.replace(/,/g, '')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // Formato chileno miles: 277.312 → 277312
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0 || n > 50_000_000) return null
  return Math.round(n)
}

/**
 * OCR vía OCR.space con base64 (más fiable en Expo Go / iOS).
 * Requiere internet. Clave free de prueba.
 */
export async function detectarMontoDesdeUri(
  uri: string,
): Promise<{ sugerido: number | null; candidatos: number[]; texto: string }> {
  const manipulated = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true },
  )

  let base64 = manipulated.base64
  if (!base64) {
    base64 = await FileSystem.readAsStringAsync(manipulated.uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
  }

  const form = new FormData()
  form.append('apikey', 'K87899142388957')
  form.append('language', 'spa')
  form.append('isOverlayRequired', 'false')
  form.append('OCREngine', '2')
  form.append('scale', 'true')
  form.append('detectOrientation', 'true')
  form.append('base64Image', `data:image/jpeg;base64,${base64}`)

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: form,
  })

  if (!res.ok) {
    throw new Error(`OCR HTTP ${res.status}`)
  }

  const json = (await res.json()) as {
    IsErroredOnProcessing?: boolean
    ErrorMessage?: string | string[]
    ParsedResults?: { ParsedText?: string }[]
  }

  if (json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage)
      ? json.ErrorMessage.join(' ')
      : json.ErrorMessage ?? 'OCR error'
    throw new Error(msg)
  }

  const texto =
    json.ParsedResults?.map((p) => p.ParsedText ?? '').join('\n') ?? ''
  if (!texto.trim()) {
    throw new Error('La boleta no devolvió texto legible')
  }

  const candidatos = parseMontosCLP(texto)
  const sugerido = preferirTotal(texto, candidatos)
  return {
    sugerido,
    candidatos: candidatos.slice(0, 6),
    texto,
  }
}
