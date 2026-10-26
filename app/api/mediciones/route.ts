import type { NextRequest } from "next/server"

import { NOMBRES_CIUDADES } from "@/lib/etl/extraccion"
import { TABLA, respuestaError, supabaseServidor } from "@/lib/supabase-servidor"

const CAMPOS_ORDEN = [
  "ciudad",
  "fecha_hora",
  "temperatura_c",
  "humedad_pct",
  "precipitacion_mm",
  "importado_en",
]
const MAX_TAMANO = 100

/** Lectura paginada de los datos persistidos en Supabase. */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const pagina = Math.max(0, Number.parseInt(p.get("pagina") ?? "0", 10) || 0)
  const tamano = Math.min(MAX_TAMANO, Math.max(1, Number.parseInt(p.get("tamano") ?? "25", 10) || 25))
  const orden = CAMPOS_ORDEN.includes(p.get("orden") ?? "") ? p.get("orden")! : "fecha_hora"
  const ascendente = p.get("direccion") !== "desc"
  const ciudades = (p.get("ciudades") ?? "").split(",").filter((c) => NOMBRES_CIUDADES.includes(c))
  const desde = p.get("desde")
  const hasta = p.get("hasta")

  try {
    let consulta = supabaseServidor()
      .from(TABLA)
      .select("id, ciudad, fecha_hora, temperatura_c, humedad_pct, precipitacion_mm, importado_en", {
        count: "exact",
      })
    if (ciudades.length) consulta = consulta.in("ciudad", ciudades)
    if (desde && !Number.isNaN(Date.parse(desde))) consulta = consulta.gte("fecha_hora", desde)
    if (hasta && !Number.isNaN(Date.parse(hasta))) consulta = consulta.lte("fecha_hora", hasta)
    const { data, error, count } = await consulta
      .order(orden, { ascending: ascendente })
      .order("id", { ascending: true })
      .range(pagina * tamano, pagina * tamano + tamano - 1)
    if (error) return Response.json({ error: `Supabase: ${error.message}` }, { status: 502 })
    return Response.json({ filas: data, total: count ?? 0, pagina, tamano })
  } catch (e) {
    return respuestaError(e)
  }
}
