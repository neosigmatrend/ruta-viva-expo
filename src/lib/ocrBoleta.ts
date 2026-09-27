import * as ImageManipulator from 'expo-image-manipulator'
import { Platform } from 'react-native'

/** Extrae candidatos de monto CLP desde texto OCR. */
export function parseMontosCLP(texto: string): number[] {
  const encontrados = new Set<number>()
  const upper = texto.toUpperCase().replace(/[|]/g, 'I')

  // Cualquier comprobante: boleta, factura, voucher, ticket, recibo…
  const patterns = [
    /(?:TOTAL\s*A\s*PAGAR|TOTAL\s*PAGADO|TOTAL|SUB[\s-]?TOTAL|NETO|IVA|MONTO|PAGO|VALOR|IMPORTE|PAGADO)\s*[:$]?\s*\$?\s*([\d.]+(?:,\d{1,2})?)/g,
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

/**
 * Prioriza el total a pagar en cualquier documento tributario/comercial
 * (boleta, factura, voucher, ticket…). En facturas el bloque final suele ser:
 * TOTAL / IVA / 277.312 ← monto a pagar
 */
export function preferirTotal(
  texto: string,
  candidatos: number[],
): number | null {
  const upper = texto.toUpperCase()
  const markers = [
    '\nTOTAL A PAGAR',
    '\nTOTAL PAGADO',
    'TOTAL A PAGAR',
    '\nTOTAL',
    '\n TOTAL',
    'TOTAL\n',
  ]
  let idx = -1
  for (const mk of markers) {
    const i = upper.lastIndexOf(mk)
    if (i > idx) idx = i
  }
  if (idx >= 0) {
    const slice = upper.slice(idx, idx + 180)
    const nums = [...slice.matchAll(/\b(\d{1,3}(?:\.\d{3}){1,3})\b/g)]
      .map((m) => normalizarMonto(m[1]))
      .filter((n): n is number => n != null && n >= 100)
    if (nums.length) return Math.max(...nums)
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
    s = s.replace(/\./g, '')
  }
  const n = Number(s)
  if (!Number.isFinite(n) || n <= 0 || n > 50_000_000) return null
  return Math.round(n)
}

/**
 * OCR.space con archivo JPEG (base64 falla con 400 en esta API).
 * Requiere internet.
 */
export async function detectarMontoDesdeUri(
  uri: string,
): Promise<{ sugerido: number | null; candidatos: number[]; texto: string }> {
  const compressed = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1400 } }],
    { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG },
  )

  const fileUri =
    Platform.OS === 'ios' && !compressed.uri.startsWith('file://')
      ? `file://${compressed.uri}`
      : compressed.uri

  const form = new FormData()
  form.append('apikey', 'helloworld')
  form.append('language', 'spa')
  form.append('isOverlayRequired', 'false')
  form.append('OCREngine', '2')
  form.append('scale', 'true')
  form.append('detectOrientation', 'true')
  form.append('file', {
    uri: fileUri,
    name: 'boleta.jpg',
    type: 'image/jpeg',
  } as unknown as Blob)

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: form,
  })

  const rawText = await res.text()
  let json: {
    IsErroredOnProcessing?: boolean
    ErrorMessage?: string | string[]
    ParsedResults?: { ParsedText?: string }[]
    OCRExitCode?: number
  }
  try {
    json = JSON.parse(rawText)
  } catch {
    throw new Error(`OCR respuesta inválida (HTTP ${res.status})`)
  }

  if (!res.ok || json.IsErroredOnProcessing) {
    const msg = Array.isArray(json.ErrorMessage)
      ? json.ErrorMessage.join(' ')
      : json.ErrorMessage ?? `HTTP ${res.status}`
    throw new Error(String(msg))
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
