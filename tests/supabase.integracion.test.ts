// Pruebas de integración contra Supabase a través de la API de la aplicación.
// Requiere la app en marcha y la migración aplicada:
//   APP_URL=http://localhost:3000 npm test
import { describe, expect, it } from "vitest"

import { TAM_LOTE, dividirEnLotes, enviarLotes, lotesIniciales, resumenLotes } from "@/lib/etl/carga"
import { CIUDADES, construirUrl, descargarCiudad } from "@/lib/etl/extraccion"
import { ordenar } from "@/lib/etl/filtros"
import { limpiar } from "@/lib/etl/limpieza"
import type { Medicion } from "@/lib/etl/tipos"
import { transformarRespuesta } from "@/lib/etl/transformacion"

const APP = process.env.APP_URL

async function post(ruta: string, cuerpo: unknown) {
  const r = await fetch(`${APP}${ruta}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) })
  return { status: r.status, json: await r.json() }
}

async function enviar(lote: Medicion[]) {
  const r = await post("/api/carga", { registros: lote })
  if (r.status !== 200) throw new Error(r.json.error)
}

async function contar(ciudad: string, desde: string, hasta: string) {
  const r = await fetch(`${APP}/api/mediciones?ciudades=${ciudad}&desde=${desde}&hasta=${hasta}&tamano=1`)
  return (await r.json()).total as number
}

describe.skipIf(!APP)("8 y 9. carga real en Supabase", () => {
  let conjunto: Medicion[] = []
  const DESDE = "2026-09-01T00:00:00Z"
  const HASTA = "2026-09-30T23:00:00Z"

  it("carga 720 registros reales de Bilbao en 2 lotes y los verifica", async () => {
    const json = await descargarCiudad(construirUrl(CIUDADES[3], "2026-09-01", "2026-09-30"))
    conjunto = ordenar(limpiar(transformarRespuesta("Bilbao", json).registros).validos, { campo: "temperatura_c", direccion: "desc" })
    expect(conjunto).toHaveLength(720)
    const lotes = dividirEnLotes(conjunto)
    expect(lotes.map((l) => l.length)).toEqual([TAM_LOTE, 220])
    const enviados: Medicion[] = []
    const estados = await enviarLotes(lotes, lotesIniciales(lotes), [0, 1], async (l) => { enviados.push(...l); await enviar(l) }, () => {})
    expect(estados.every((e) => e.estado === "ok")).toBe(true)
    expect(enviados).toEqual(conjunto)

    for (const tramo of dividirEnLotes(conjunto.map(({ ciudad, fecha_hora }) => ({ ciudad, fecha_hora })))) {
      const v = await post("/api/verificacion", { claves: tramo })
      expect(v.json.faltan).toEqual([])
    }
    expect(await contar("Bilbao", DESDE, HASTA)).toBe(720)
  })

  it("una segunda carga no duplica (upsert por ciudad y fecha_hora)", async () => {
    const lotes = dividirEnLotes(conjunto)
    const estados = await enviarLotes(lotes, lotesIniciales(lotes), [0, 1], enviar, () => {})
    expect(resumenLotes(estados).correctos).toBe(720)
    expect(await contar("Bilbao", DESDE, HASTA)).toBe(720)
  })

  it("9. fallo parcial real: el lote inválido falla, el resto persiste y el reintento lo completa", async () => {
    // Datos reales de Valencia (1 día); solo se corrompe en tránsito una copia de una fila.
    const json = await descargarCiudad(construirUrl(CIUDADES[4], "2026-08-01", "2026-08-01"))
    const base = limpiar(transformarRespuesta("Valencia", json).registros).validos
    const lotes = dividirEnLotes(base, 12)
    const corrupto = lotes[1].map((m, i) => (i === 0 ? { ...m, humedad_pct: 150 } : m))
    const enviarConFallo = (l: Medicion[]) => enviar(l === lotes[1] ? corrupto : l)
    let estados = await enviarLotes(lotes, lotesIniciales(lotes), [0, 1], enviarConFallo, () => {})
    expect(estados.map((e) => e.estado)).toEqual(["ok", "error"])
    expect(estados[1].error).toMatch(/validación del servidor/)
    expect(await contar("Valencia", "2026-08-01T00:00:00Z", "2026-08-31T23:00:00Z")).toBe(12)

    estados = await enviarLotes(lotes, estados, resumenLotes(estados).lotesFallidos, enviar, () => {})
    expect(estados.map((e) => e.estado)).toEqual(["ok", "ok"])
    expect(await contar("Valencia", "2026-08-01T00:00:00Z", "2026-08-31T23:00:00Z")).toBe(24)
  })
})
