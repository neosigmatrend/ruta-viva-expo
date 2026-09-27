/** Extrae candidatos de monto CLP desde texto OCR de boleta/voucher. */
export function parseMontosCLP(texto: string): number[] {
  const encontrados = new Set<number>()
  const lines = texto
    .toUpperCase()
    .replace(/[|]/g, 'I')
    .split(/\n+/)

  const patterns = [
    /(?:TOTAL|TOTAL\s*A\s*PAGAR|MONTO|PAGO|VALOR|EFECTIVO|DEBITO|CREDITO|TARJETA)\s*[:$]?\s*\$?\s*([\d.]+(?:,\d{1,2})?)/g,
    /\$\s*([\d.]+(?:,\d{1,2})?)/g,
  ]

  for (const line of lines) {
    for (const re of patterns) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(line))) {
        const n = normalizarMonto(m[1])
        if (n != null) encontrados.add(n)
      }
    }
  }

  for (const m of texto.matchAll(/\b(\d{1,3}(?:\.\d{3})+|\d{3,7})\b/g)) {
    const n = normalizarMonto(m[1])
    if (n != null && n >= 100) encontrados.add(n)
  }

  return [...encontrados].sort((a, b) => b - a)
}

function normalizarMonto(raw: string): number | null {
  let s = raw.trim()
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
  if (!Number.isFinite(n) || n <= 0 || n > 5_000_000) return null
  return Math.round(n)
}

/**
 * OCR vía OCR.space (funciona en Expo Go; necesita datos/WiFi).
 * Clave free de prueba — para producción conviene tu propia key en ocr.space.
 */
export async function detectarMontoDesdeUri(
  uri: string,
): Promise<{ sugerido: number | null; candidatos: number[]; texto: string }> {
  const form = new FormData()
  form.append('apikey', 'K87899142388957')
  form.append('language', 'spa')
  form.append('isOverlayRequired', 'false')
  form.append('OCREngine', '2')
  form.append('scale', 'true')
  form.append('file', {
    uri,
    name: 'boleta.jpg',
    type: 'image/jpeg',
  } as unknown as Blob)

  const res = await fetch('https://api.ocr.space/parse/image', {
    method: 'POST',
    body: form,
  })
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

  const texto = json.ParsedResults?.map((p) => p.ParsedText ?? '').join('\n') ?? ''
  const candidatos = parseMontosCLP(texto)
  return {
    sugerido: candidatos[0] ?? null,
    candidatos: candidatos.slice(0, 5),
    texto,
  }
}
