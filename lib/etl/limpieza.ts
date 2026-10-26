import { NOMBRES_CIUDADES } from "./extraccion"
import type { Medicion, Rechazo, RegistroTransformado } from "./tipos"

const ETIQUETAS = {
  temperatura_c: "Temperatura",
  humedad_pct: "Humedad",
  precipitacion_mm: "Precipitación",
} as const

type CampoNumerico = keyof typeof ETIQUETAS

/** Devuelve el número si es finito, o el motivo por el que no se acepta. */
function comprobarNumero(
  campo: CampoNumerico,
  valor: unknown
): number | string {
  const etiqueta = ETIQUETAS[campo]
  if (valor === undefined) return `${etiqueta} ausente`
  if (valor === null) return `${etiqueta} nula (null)`
  if (typeof valor === "string" && valor.trim() === "")
    return `${etiqueta} vacía ("")`
  if (typeof valor !== "number") return `${etiqueta} no numérica (${typeof valor})`
  if (!Number.isFinite(valor)) return `${etiqueta} no finita`
  return valor
}

/** Reglas de dominio; se reutilizan en cliente y servidor. */
export function reglasDominio(m: {
  humedad_pct?: number
  precipitacion_mm?: number
}): string[] {
  const motivos: string[] = []
  if (m.humedad_pct !== undefined && (m.humedad_pct < 0 || m.humedad_pct > 100))
    motivos.push(`Humedad fuera de rango 0–100 (${m.humedad_pct})`)
  if (m.precipitacion_mm !== undefined && m.precipitacion_mm < 0)
    motivos.push(`Precipitación negativa (${m.precipitacion_mm})`)
  return motivos
}

export function validarRegistro(r: RegistroTransformado): {
  medicion?: Medicion
  motivos: string[]
} {
  const motivos: string[] = []
  if (r.arrays_incoherentes) motivos.push("Arrays de longitud incoherente")
  if (!r.ciudad || r.ciudad.trim() === "") motivos.push("Ciudad ausente")
  if (!r.fecha_hora)
    motivos.push(`Fecha/hora inválida (${JSON.stringify(r.fecha_hora_original) ?? "ausente"})`)

  const valores = {} as Record<CampoNumerico, number>
  for (const campo of Object.keys(ETIQUETAS) as CampoNumerico[]) {
    const v = comprobarNumero(campo, r[campo])
    if (typeof v === "string") motivos.push(v)
    else valores[campo] = v
  }
  motivos.push(...reglasDominio(valores))

  if (motivos.length > 0) return { motivos }
  return {
    motivos,
    medicion: {
      ciudad: r.ciudad!,
      fecha_hora: r.fecha_hora!,
      temperatura_c: valores.temperatura_c,
      humedad_pct: valores.humedad_pct,
      precipitacion_mm: valores.precipitacion_mm,
    },
  }
}

export function claveMedicion(m: { ciudad: string; fecha_hora: string }) {
  return `${m.ciudad}|${m.fecha_hora}`
}

export type ResultadoLimpieza = {
  validos: Medicion[]
  rechazados: Rechazo[]
}

/**
 * Valida cada registro y elimina duplicados por (ciudad, fecha_hora).
 * Política de duplicados: se conserva la PRIMERA aparición válida en el orden
 * de llegada (orden de ciudades y orden del array) y se rechazan las demás.
 */
export function limpiar(registros: RegistroTransformado[]): ResultadoLimpieza {
  const validos: Medicion[] = []
  const rechazados: Rechazo[] = []
  const vistos = new Map<string, RegistroTransformado>()
  for (const r of registros) {
    const { medicion, motivos } = validarRegistro(r)
    if (!medicion) {
      rechazados.push({ registro: r, motivos })
      continue
    }
    const clave = claveMedicion(medicion)
    const previo = vistos.get(clave)
    if (previo) {
      rechazados.push({
        registro: r,
        motivos: [
          `Duplicado de ${medicion.ciudad} ${medicion.fecha_hora}: se conserva la primera aparición (fila ${previo.indice})`,
        ],
      })
      continue
    }
    vistos.set(clave, r)
    validos.push(medicion)
  }
  return { validos, rechazados }
}

const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/
const CAMPOS_MEDICION = [
  "ciudad",
  "fecha_hora",
  "temperatura_c",
  "humedad_pct",
  "precipitacion_mm",
] as const

/**
 * Validación estricta en servidor de un objeto recibido por la red.
 * Devuelve la medición normalizada o la lista de errores.
 */
export function validarMedicionEntrante(
  valor: unknown
): { medicion: Medicion } | { errores: string[] } {
  if (!valor || typeof valor !== "object" || Array.isArray(valor))
    return { errores: ["No es un objeto"] }
  const o = valor as Record<string, unknown>
  const errores: string[] = []
  const extra = Object.keys(o).filter(
    (k) => !(CAMPOS_MEDICION as readonly string[]).includes(k)
  )
  if (extra.length) errores.push(`Campos no permitidos: ${extra.join(", ")}`)
  if (typeof o.ciudad !== "string" || !NOMBRES_CIUDADES.includes(o.ciudad))
    errores.push("Ciudad no reconocida")
  if (
    typeof o.fecha_hora !== "string" ||
    !ISO_UTC_RE.test(o.fecha_hora) ||
    Number.isNaN(Date.parse(o.fecha_hora))
  )
    errores.push("fecha_hora debe ser ISO 8601 en UTC (sufijo Z)")
  for (const campo of ["temperatura_c", "humedad_pct", "precipitacion_mm"] as const) {
    const v = o[campo]
    if (typeof v !== "number" || !Number.isFinite(v))
      errores.push(`${campo} debe ser un número finito`)
  }
  if (errores.length === 0)
    errores.push(
      ...reglasDominio({
        humedad_pct: o.humedad_pct as number,
        precipitacion_mm: o.precipitacion_mm as number,
      })
    )
  if (errores.length) return { errores }
  return {
    medicion: {
      ciudad: o.ciudad as string,
      fecha_hora: new Date(o.fecha_hora as string).toISOString(),
      temperatura_c: o.temperatura_c as number,
      humedad_pct: o.humedad_pct as number,
      precipitacion_mm: o.precipitacion_mm as number,
    },
  }
}
