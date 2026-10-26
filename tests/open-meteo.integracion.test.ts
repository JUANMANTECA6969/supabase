// Prueba contra la API real de Open-Meteo (requiere red).
import { describe, expect, it } from "vitest"

import { CIUDADES, construirUrl, descargarCiudad } from "@/lib/etl/extraccion"
import { limpiar } from "@/lib/etl/limpieza"
import { transformarRespuesta } from "@/lib/etl/transformacion"

describe("1. extracción real: una ciudad, un día", () => {
  it("devuelve 24 registros horarios en UTC", async () => {
    const url = construirUrl(CIUDADES[0], "2026-09-01", "2026-09-01")
    const json = (await descargarCiudad(url)) as { timezone: string; utc_offset_seconds: number }
    expect(json.utc_offset_seconds).toBe(0)
    const { registros, avisos } = transformarRespuesta("Barcelona", json)
    expect(avisos).toEqual([])
    expect(registros).toHaveLength(24)
    expect(registros[0].fecha_hora).toBe("2026-09-01T00:00:00Z")
    expect(registros[23].fecha_hora).toBe("2026-09-01T23:00:00Z")
    const { validos, rechazados } = limpiar(registros)
    console.log(`Barcelona 2026-09-01: ${validos.length} válidos, ${rechazados.length} rechazados`)
    expect(validos.length + rechazados.length).toBe(24)
  })

  it("informa del error de la API con su motivo", async () => {
    await expect(
      descargarCiudad(construirUrl(CIUDADES[0], "2026-09-02", "2026-09-01"))
    ).rejects.toThrow(/HTTP 400/)
  })
})
