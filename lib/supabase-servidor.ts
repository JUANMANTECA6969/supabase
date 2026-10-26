import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const TABLA = "mediciones_meteorologicas"

export class ConfiguracionError extends Error {}

let cliente: SupabaseClient | null = null

/**
 * Cliente con la clave secreta (service role). Solo se importa desde rutas de
 * servidor: "server-only" rompe el build si un componente cliente lo importa.
 */
export function supabaseServidor(): SupabaseClient {
  if (cliente) return cliente
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) {
    throw new ConfiguracionError(
      "Faltan SUPABASE_URL (o NEXT_PUBLIC_SUPABASE_URL) y/o SUPABASE_SERVICE_ROLE_KEY en el entorno del servidor."
    )
  }
  cliente = createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cliente
}

/** Respuesta de error sin filtrar detalles sensibles. */
export function respuestaError(e: unknown, estado = 500) {
  if (e instanceof ConfiguracionError)
    return Response.json({ error: e.message }, { status: 503 })
  const mensaje = e instanceof Error ? e.message : "Error desconocido"
  console.error("[api]", mensaje)
  return Response.json({ error: mensaje }, { status: estado })
}

/**
 * Lee el cuerpo JSON comprobando el tamaño real (no solo Content-Length,
 * que el cliente puede omitir o falsear).
 */
export async function leerJsonLimitado(
  request: Request,
  maxBytes: number
): Promise<{ ok: true; datos: unknown } | { ok: false; respuesta: Response }> {
  const declarado = Number(request.headers.get("content-length") ?? 0)
  if (declarado > maxBytes)
    return {
      ok: false,
      respuesta: Response.json({ error: `Petición demasiado grande (máx. ${maxBytes} bytes).` }, { status: 413 }),
    }
  const texto = await request.text()
  if (new TextEncoder().encode(texto).length > maxBytes)
    return {
      ok: false,
      respuesta: Response.json({ error: `Petición demasiado grande (máx. ${maxBytes} bytes).` }, { status: 413 }),
    }
  try {
    return { ok: true, datos: JSON.parse(texto) }
  } catch {
    return { ok: false, respuesta: Response.json({ error: "JSON no válido." }, { status: 400 }) }
  }
}
