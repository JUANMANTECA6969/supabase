import { VARIABLES_HORARIAS } from "./extraccion"
import type { RegistroTransformado } from "./tipos"

const HORA_OPEN_METEO_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/

/**
 * Interpreta "AAAA-MM-DDTHH:MM" (formato de Open-Meteo con timezone=UTC)
 * explícitamente como UTC. Devuelve ISO con sufijo Z o null.
 * No se usa new Date(texto) sin zona porque el navegador lo interpretaría
 * como hora local.
 */
export function interpretarFechaUTC(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  const m = HORA_OPEN_METEO_RE.exec(valor)
  if (!m) return null
  const iso = `${m[1]}T${m[2]}:${m[3]}:00Z`
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  const normalizado = new Date(ms).toISOString().replace(".000Z", "Z")
  // Si Date ha "corregido" la fecha (p. ej. 25:00 o 30 de febrero), es inválida.
  return normalizado === iso ? iso : null
}

export type ResultadoTransformacion = {
  registros: RegistroTransformado[]
  avisos: string[]
}

/** Convierte los arrays paralelos de una ciudad en un registro por hora. */
export function transformarRespuesta(
  ciudad: string,
  json: unknown
): ResultadoTransformacion {
  const avisos: string[] = []
  const hourly =
    json && typeof json === "object" && "hourly" in json
      ? (json as { hourly: unknown }).hourly
      : undefined
  if (!hourly || typeof hourly !== "object") {
    return { registros: [], avisos: [`${ciudad}: falta el bloque "hourly".`] }
  }
  const h = hourly as Record<string, unknown>
  if (!Array.isArray(h.time)) {
    return { registros: [], avisos: [`${ciudad}: "hourly.time" no es un array.`] }
  }
  const tiempos = h.time as unknown[]

  const arrays: Record<string, unknown[]> = {}
  const longitudes: string[] = [`time=${tiempos.length}`]
  let incoherente = false
  for (const variable of VARIABLES_HORARIAS) {
    const valor = h[variable]
    if (!Array.isArray(valor)) {
      avisos.push(`${ciudad}: falta el array "${variable}".`)
      arrays[variable] = []
      incoherente = true
      longitudes.push(`${variable}=ausente`)
      continue
    }
    arrays[variable] = valor
    longitudes.push(`${variable}=${valor.length}`)
    if (valor.length !== tiempos.length) incoherente = true
  }
  if (incoherente) {
    avisos.push(
      `${ciudad}: longitudes incoherentes (${longitudes.join(", ")}). ` +
        "No se puede garantizar qué valor corresponde a cada hora: se rechazan todas sus filas."
    )
  }

  const registros = tiempos.map(
    (t, i): RegistroTransformado => ({
      id: `${ciudad}#${i}`,
      ciudad,
      indice: i,
      fecha_hora_original: t,
      fecha_hora: interpretarFechaUTC(t),
      // Si el índice no existe se conserva undefined (ausente), nunca 0.
      temperatura_c: arrays.temperature_2m[i],
      humedad_pct: arrays.relative_humidity_2m[i],
      precipitacion_mm: arrays.precipitation[i],
      arrays_incoherentes: incoherente,
    })
  )
  return { registros, avisos }
}
