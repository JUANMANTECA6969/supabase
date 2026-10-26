import type { Ciudad } from "./tipos"

export const OPEN_METEO_ARCHIVE_URL =
  "https://archive-api.open-meteo.com/v1/archive"

export const VARIABLES_HORARIAS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
] as const

export const MAX_DIAS = 31
/** Primer día disponible en el archivo histórico (ERA5). */
export const FECHA_MINIMA = "1940-01-01"

export const CIUDADES: Ciudad[] = [
  { nombre: "Barcelona", latitud: 41.3874, longitud: 2.1686 },
  { nombre: "Madrid", latitud: 40.4168, longitud: -3.7038 },
  { nombre: "Sevilla", latitud: 37.3891, longitud: -5.9845 },
  { nombre: "Bilbao", latitud: 43.263, longitud: -2.935 },
  { nombre: "Valencia", latitud: 39.4699, longitud: -0.3763 },
]

export const NOMBRES_CIUDADES = CIUDADES.map((c) => c.nombre)

export const PERIODO_INICIAL = { inicio: "2026-09-01", fin: "2026-09-30" }

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

/** Convierte "AAAA-MM-DD" en milisegundos UTC, o null si no es una fecha real. */
export function fechaDiaUTC(valor: string): number | null {
  if (!FECHA_RE.test(valor)) return null
  const ms = Date.parse(`${valor}T00:00:00Z`)
  if (Number.isNaN(ms)) return null
  // Descarta fechas como 2026-02-30, que Date "corrige" al mes siguiente.
  if (new Date(ms).toISOString().slice(0, 10) !== valor) return null
  return ms
}

export function diasEntre(inicio: string, fin: string): number | null {
  const a = fechaDiaUTC(inicio)
  const b = fechaDiaUTC(fin)
  if (a === null || b === null) return null
  return Math.round((b - a) / 86_400_000) + 1
}

export function hoyUTC(ahora = new Date()): string {
  return ahora.toISOString().slice(0, 10)
}

export function validarConfiguracion(
  ciudades: string[],
  inicio: string,
  fin: string,
  hoy = hoyUTC()
): string[] {
  const errores: string[] = []
  if (ciudades.length === 0) errores.push("Selecciona al menos una ciudad.")
  const a = fechaDiaUTC(inicio)
  const b = fechaDiaUTC(fin)
  if (a === null) errores.push("La fecha inicial no es válida.")
  if (b === null) errores.push("La fecha final no es válida.")
  if (a !== null && b !== null) {
    const dias = diasEntre(inicio, fin)!
    if (dias < 1)
      errores.push("La fecha final debe ser igual o posterior a la inicial.")
    else if (dias > MAX_DIAS)
      errores.push(
        `El periodo tiene ${dias} días; el máximo por extracción es ${MAX_DIAS}.`
      )
    if (inicio < FECHA_MINIMA)
      errores.push(`El archivo histórico empieza el ${FECHA_MINIMA}.`)
    if (fin > hoy)
      errores.push(
        "La fecha final no puede ser futura: es una API de datos históricos."
      )
  }
  return errores
}

export function construirUrl(ciudad: Ciudad, inicio: string, fin: string) {
  const params = new URLSearchParams({
    latitude: String(ciudad.latitud),
    longitude: String(ciudad.longitud),
    start_date: inicio,
    end_date: fin,
    hourly: VARIABLES_HORARIAS.join(","),
    timezone: "UTC",
    temperature_unit: "celsius",
    precipitation_unit: "mm",
  })
  return `${OPEN_METEO_ARCHIVE_URL}?${params}`
}

/**
 * Descarga el JSON de una ciudad. Lanza un Error con mensaje legible si la
 * respuesta HTTP no es correcta (Open-Meteo devuelve {error, reason}).
 */
export async function descargarCiudad(
  url: string,
  fetcher: typeof fetch = fetch
): Promise<unknown> {
  let respuesta: Response
  try {
    respuesta = await fetcher(url)
  } catch (e) {
    throw new Error(
      `No se pudo conectar con Open-Meteo: ${e instanceof Error ? e.message : String(e)}`
    )
  }
  let cuerpo: unknown
  try {
    cuerpo = await respuesta.json()
  } catch {
    throw new Error(`Respuesta no JSON (HTTP ${respuesta.status}).`)
  }
  if (!respuesta.ok) {
    const motivo =
      cuerpo && typeof cuerpo === "object" && "reason" in cuerpo
        ? String((cuerpo as { reason: unknown }).reason)
        : "sin detalle"
    throw new Error(`HTTP ${respuesta.status}: ${motivo}`)
  }
  return cuerpo
}
