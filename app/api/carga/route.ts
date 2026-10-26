import { TAM_LOTE } from "@/lib/etl/carga"
import { claveMedicion, validarMedicionEntrante } from "@/lib/etl/limpieza"
import type { Medicion } from "@/lib/etl/tipos"
import {
  TABLA,
  leerJsonLimitado,
  respuestaError,
  supabaseServidor,
} from "@/lib/supabase-servidor"

// AVISO: sin autenticación. Válido solo para desarrollo local (ver README).
const MAX_BYTES = 256 * 1024

export async function POST(request: Request) {
  const cuerpo = await leerJsonLimitado(request, MAX_BYTES)
  if (!cuerpo.ok) return cuerpo.respuesta
  const registros = (cuerpo.datos as { registros?: unknown })?.registros
  if (!Array.isArray(registros) || registros.length === 0)
    return Response.json({ error: "Se esperaba { registros: [...] } no vacío." }, { status: 400 })
  if (registros.length > TAM_LOTE)
    return Response.json({ error: `Máximo ${TAM_LOTE} registros por lote.` }, { status: 413 })

  const validos: Medicion[] = []
  const errores: { fila: number; errores: string[] }[] = []
  const claves = new Set<string>()
  registros.forEach((r, fila) => {
    const res = validarMedicionEntrante(r)
    if ("errores" in res) return errores.push({ fila, errores: res.errores })
    const clave = claveMedicion(res.medicion)
    if (claves.has(clave))
      return errores.push({ fila, errores: ["Clave (ciudad, fecha_hora) repetida en el lote"] })
    claves.add(clave)
    validos.push(res.medicion)
  })
  if (errores.length)
    return Response.json(
      {
        error: `${errores.length} registro(s) no superan la validación del servidor; no se ha escrito nada de este lote.`,
        detalles: errores.slice(0, 20),
      },
      { status: 422 }
    )

  try {
    const { error } = await supabaseServidor()
      .from(TABLA)
      .upsert(validos, { onConflict: "ciudad,fecha_hora" })
    if (error) return Response.json({ error: `Supabase: ${error.message}` }, { status: 502 })
    // PostgREST no distingue filas insertadas de actualizadas en un upsert:
    // solo informamos de las filas procesadas.
    return Response.json({ procesados: validos.length })
  } catch (e) {
    return respuestaError(e)
  }
}
