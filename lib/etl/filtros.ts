import { claveMedicion } from "./limpieza"
import type { CampoOrden, Medicion, Orden } from "./tipos"

export type Filtros = {
  ciudades: string[]
  /** "AAAA-MM-DDTHH:MM" interpretado como UTC, o "" sin límite. */
  desde: string
  hasta: string
  tempMin: string
  tempMax: string
  humMin: string
  humMax: string
  precMin: string
  precMax: string
  soloLluvia: boolean
}

export function filtrosIniciales(ciudades: string[]): Filtros {
  return {
    ciudades: [...ciudades],
    desde: "",
    hasta: "",
    tempMin: "",
    tempMax: "",
    humMin: "",
    humMax: "",
    precMin: "",
    precMax: "",
    soloLluvia: false,
  }
}

export const ORDEN_INICIAL: Orden = { campo: "fecha_hora", direccion: "asc" }

function limite(texto: string): number | null {
  if (texto.trim() === "") return null
  const n = Number(texto)
  return Number.isFinite(n) ? n : null
}

function fechaLimite(texto: string): number | null {
  if (!texto) return null
  const ms = Date.parse(`${texto.length === 16 ? `${texto}:00` : texto}Z`)
  return Number.isNaN(ms) ? null : ms
}

/** Avisos de filtros contradictorios (no bloquean, pero explican un 0). */
export function avisosFiltros(f: Filtros): string[] {
  const avisos: string[] = []
  const pares: [string, string, string][] = [
    [f.tempMin, f.tempMax, "temperatura"],
    [f.humMin, f.humMax, "humedad"],
    [f.precMin, f.precMax, "precipitación"],
  ]
  for (const [a, b, nombre] of pares) {
    const min = limite(a)
    const max = limite(b)
    if (min !== null && max !== null && min > max)
      avisos.push(`El mínimo de ${nombre} es mayor que el máximo.`)
  }
  const d = fechaLimite(f.desde)
  const h = fechaLimite(f.hasta)
  if (d !== null && h !== null && d > h)
    avisos.push("La fecha «desde» es posterior a «hasta».")
  if (f.ciudades.length === 0) avisos.push("No hay ninguna ciudad marcada.")
  return avisos
}

export function aplicarFiltros(validos: Medicion[], f: Filtros): Medicion[] {
  const ciudades = new Set(f.ciudades)
  const desde = fechaLimite(f.desde)
  const hasta = fechaLimite(f.hasta)
  const rangos: [keyof Medicion, number | null, number | null][] = [
    ["temperatura_c", limite(f.tempMin), limite(f.tempMax)],
    ["humedad_pct", limite(f.humMin), limite(f.humMax)],
    ["precipitacion_mm", limite(f.precMin), limite(f.precMax)],
  ]
  return validos.filter((m) => {
    if (!ciudades.has(m.ciudad)) return false
    const t = Date.parse(m.fecha_hora)
    if (desde !== null && t < desde) return false
    if (hasta !== null && t > hasta) return false
    for (const [campo, min, max] of rangos) {
      const v = m[campo] as number
      if (min !== null && v < min) return false
      if (max !== null && v > max) return false
    }
    if (f.soloLluvia && !(m.precipitacion_mm > 0)) return false
    return true
  })
}

function comparar(a: Medicion, b: Medicion, campo: CampoOrden): number {
  const x = a[campo]
  const y = b[campo]
  if (typeof x === "string" && typeof y === "string") return x.localeCompare(y, "es")
  return (x as number) - (y as number)
}

/** Orden estable; desempata por ciudad y fecha para que sea determinista. */
export function ordenar(registros: Medicion[], orden: Orden): Medicion[] {
  const signo = orden.direccion === "asc" ? 1 : -1
  return [...registros].sort(
    (a, b) =>
      signo * comparar(a, b, orden.campo) ||
      comparar(a, b, "ciudad") ||
      comparar(a, b, "fecha_hora")
  )
}

export function paginar<T>(filas: T[], pagina: number, tamano: number): T[] {
  return filas.slice(pagina * tamano, (pagina + 1) * tamano)
}

/**
 * Conjunto exacto que se subiría: filas filtradas y ordenadas que además
 * están seleccionadas. Las seleccionadas fuera de filtros no se incluyen.
 */
export function conjuntoCarga(
  ordenados: Medicion[],
  seleccion: ReadonlySet<string>
): Medicion[] {
  return ordenados.filter((m) => seleccion.has(claveMedicion(m)))
}

export function seleccionadasFueraDeFiltros(
  ordenados: Medicion[],
  seleccion: ReadonlySet<string>
): number {
  let dentro = 0
  for (const m of ordenados) if (seleccion.has(claveMedicion(m))) dentro++
  return seleccion.size - dentro
}
