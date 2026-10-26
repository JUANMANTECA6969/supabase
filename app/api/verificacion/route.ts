import { TAM_LOTE } from "@/lib/etl/carga"
import { NOMBRES_CIUDADES } from "@/lib/etl/extraccion"
import {
  TABLA,
  leerJsonLimitado,
  respuestaError,
  supabaseServidor,
} from "@/lib/supabase-servidor"

const MAX_BYTES = 128 * 1024
/** Fechas por consulta: mantiene la URL de PostgREST por debajo de ~8 KB. */
const FECHAS_POR_CONSULTA = 150

type Clave = { ciudad: string; fecha_hora: string }

function esClave(v: unknown): v is Clave {
  if (!v || typeof v !== "object") return false
  const o = v as Record<string, unknown>
  return (
    typeof o.ciudad === "string" &&
    NOMBRES_CIUDADES.includes(o.ciudad) &&
    typeof o.fecha_hora === "string" &&
    !Number.isNaN(Date.parse(o.fecha_hora))
  )
}

const iso = (t: string) => new Date(t).toISOString()

/** Comprueba qué claves (ciudad, fecha_hora) existen realmente en la tabla. */
export async function POST(request: Request) {
  const cuerpo = await leerJsonLimitado(request, MAX_BYTES)
  if (!cuerpo.ok) return cuerpo.respuesta
  const claves = (cuerpo.datos as { claves?: unknown })?.claves
  if (!Array.isArray(claves) || claves.length === 0 || claves.length > TAM_LOTE)
    return Response.json({ error: `Se esperaban entre 1 y ${TAM_LOTE} claves.` }, { status: 400 })
  if (!claves.every(esClave))
    return Response.json({ error: "Hay claves con formato no válido." }, { status: 400 })

  const porCiudad = new Map<string, string[]>()
  for (const c of claves) {
    const lista = porCiudad.get(c.ciudad) ?? []
    lista.push(iso(c.fecha_hora))
    porCiudad.set(c.ciudad, lista)
  }

  try {
    const existentes = new Set<string>()
    for (const [ciudad, fechas] of porCiudad) {
      for (let i = 0; i < fechas.length; i += FECHAS_POR_CONSULTA) {
        const tramo = fechas.slice(i, i + FECHAS_POR_CONSULTA)
        const { data, error } = await supabaseServidor()
          .from(TABLA)
          .select("ciudad, fecha_hora")
          .eq("ciudad", ciudad)
          .in("fecha_hora", tramo)
        if (error) return Response.json({ error: `Supabase: ${error.message}` }, { status: 502 })
        for (const fila of data) existentes.add(`${fila.ciudad}|${iso(fila.fecha_hora)}`)
      }
    }
    const faltan = (claves as Clave[]).filter(
      (c) => !existentes.has(`${c.ciudad}|${iso(c.fecha_hora)}`)
    )
    return Response.json({ comprobadas: claves.length, encontradas: claves.length - faltan.length, faltan })
  } catch (e) {
    return respuestaError(e)
  }
}
