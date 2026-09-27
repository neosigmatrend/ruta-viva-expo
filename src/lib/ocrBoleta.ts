import * as ImageManipulator from 'expo-image-manipulator'
import * as FileSystem from 'expo-file-system/legacy'
import { Platform } from 'react-native'

/** Extrae candidatos de monto CLP desde texto OCR. */
export function parseMontosCLP(texto: string): number[] {
  const encontrados = new Set<number>()
  const upper = texto.toUpperCase().replace(/[|]/g, 'I')

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

function ensureFileUri(uri: string): string {
  if (Platform.OS === 'ios' && !uri.startsWith('file://') && !uri.startsWith('content://')) {
    return `file://${uri}`
  }
  return uri
}

function looksPdf(uri: string, mime?: string | null, name?: string | null): boolean {
  const u = `${uri} ${mime ?? ''} ${name ?? ''}`.toLowerCase()
  return u.includes('.pdf') || u.includes('application/pdf')
}

type Upload = { uri: string; name: string; type: string }

/** Convierte HEIC/PNG/etc. a JPEG (OCR.space no acepta HEIC). */
async function prepararUpload(
  uri: string,
  mime?: string | null,
  name?: string | null,
): Promise<Upload> {
  if (looksPdf(uri, mime, name)) {
    return {
      uri: ensureFileUri(uri),
      name: name?.toLowerCase().endsWith('.pdf') ? name : 'comprobante.pdf',
      type: 'application/pdf',
    }
  }

  try {
    const compressed = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1400 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    )
    return {
      uri: ensureFileUri(compressed.uri),
      name: 'comprobante.jpg',
      type: 'image/jpeg',
    }
  } catch {
    // Si no se puede manipular, intentar igual como jpeg
    return {
      uri: ensureFileUri(uri),
      name: 'comprobante.jpg',
      type: 'image/jpeg',
    }
  }
}

async function ocrConArchivo(upload: Upload) {
  const form = new FormData()
  form.append('apikey', 'helloworld')
  form.append('language', 'spa')
  form.append('isOverlayRequired', 'false')
  form.append('OCREngine', '2')
  form.append('scale', 'true')
  form.append('detectOrientation', 'true')
  form.append('file', {
    uri: upload.uri,
    name: upload.name,
    type: upload.type,
  } as unknown as Blob)

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: form,
  })
  return parseOcrResponse(res)
}

/** Fallback: JPEG pequeño en base64 (evita “File type not supported” de HEIC). */
async function ocrConBase64Jpeg(uri: string) {
  const compressed = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1200 } }],
    {
      compress: 0.65,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  )
  let b64 = compressed.base64
  if (!b64) {
    b64 = await FileSystem.readAsStringAsync(compressed.uri, {
      encoding: FileSystem.EncodingType.Base64,
    })
  }
  // Limitar tamaño: API free falla con base64 muy grande
  if (b64.length > 900_000) {
    const smaller = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 900 } }],
      {
        compress: 0.55,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      },
    )
    b64 =
      smaller.base64 ??
      (await FileSystem.readAsStringAsync(smaller.uri, {
        encoding: FileSystem.EncodingType.Base64,
      }))
  }

  const form = new FormData()
  form.append('apikey', 'helloworld')
  form.append('language', 'spa')
  form.append('isOverlayRequired', 'false')
  form.append('OCREngine', '2')
  form.append('scale', 'true')
  form.append('base64Image', `data:image/jpeg;base64,${b64}`)

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: form,
  })
  return parseOcrResponse(res)
}

async function parseOcrResponse(res: Response) {
  const rawText = await res.text()
  let json: {
    IsErroredOnProcessing?: boolean
    ErrorMessage?: string | string[]
    ParsedResults?: { ParsedText?: string }[]
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
    const lower = String(msg).toLowerCase()
    if (lower.includes('not supported') || lower.includes('file type')) {
      throw new Error(
        'FORMATO_NO_SOPORTADO: convertí a JPG/PNG o usá una foto de la cámara/galería (no HEIC/PDF raro).',
      )
    }
    throw new Error(String(msg))
  }

  const texto =
    json.ParsedResults?.map((p) => p.ParsedText ?? '').join('\n') ?? ''
  if (!texto.trim()) {
    throw new Error('El comprobante no devolvió texto legible')
  }

  const candidatos = parseMontosCLP(texto)
  const sugerido = preferirTotal(texto, candidatos)
  return {
    sugerido,
    candidatos: candidatos.slice(0, 6),
    texto,
  }
}

/**
 * OCR de comprobante (boleta/factura/voucher/ticket).
 * Fuerza JPEG cuando es imagen (HEIC del iPhone → JPG).
 */
export async function detectarMontoDesdeUri(
  uri: string,
  opts?: { mimeType?: string | null; fileName?: string | null },
): Promise<{ sugerido: number | null; candidatos: number[]; texto: string }> {
  const upload = await prepararUpload(uri, opts?.mimeType, opts?.fileName)

  try {
    return await ocrConArchivo(upload)
  } catch (e1) {
    const msg = e1 instanceof Error ? e1.message : ''
    // Reintentar como JPEG base64 si era imagen
    if (!looksPdf(uri, opts?.mimeType, opts?.fileName)) {
      try {
        return await ocrConBase64Jpeg(uri)
      } catch (e2) {
        const m2 = e2 instanceof Error ? e2.message : String(e2)
        throw new Error(m2 || msg || 'No se pudo leer el comprobante')
      }
    }
    throw e1 instanceof Error ? e1 : new Error(String(e1))
  }
}
