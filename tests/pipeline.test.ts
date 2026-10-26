import { describe, expect, it } from "vitest"

import {
  dividirEnLotes,
  enviarLotes,
  lotesIniciales,
  resumenLotes,
} from "@/lib/etl/carga"
import { validarConfiguracion } from "@/lib/etl/extraccion"
import {
  aplicarFiltros,
  conjuntoCarga,
  filtrosIniciales,
  ordenar,
  paginar,
  seleccionadasFueraDeFiltros,
} from "@/lib/etl/filtros"
import { claveMedicion, limpiar, validarMedicionEntrante } from "@/lib/etl/limpieza"
import type { Medicion } from "@/lib/etl/tipos"
import { interpretarFechaUTC, transformarRespuesta } from "@/lib/etl/transformacion"

import {
  respuestaConDuplicados,
  respuestaConNulos,
  respuestaCorrecta,
  respuestaIncoherente,
} from "./fixtures/open-meteo"

describe("configuración", () => {
  it("limita a 31 días y rechaza fechas futuras o invertidas", () => {
    expect(validarConfiguracion(["Madrid"], "2026-09-01", "2026-09-30", "2026-10-26")).toEqual([])
    expect(validarConfiguracion(["Madrid"], "2026-08-01", "2026-09-01", "2026-10-26")[0]).toMatch(/32 días/)
    expect(validarConfiguracion(["Madrid"], "2026-09-10", "2026-09-01", "2026-10-26")[0]).toMatch(/posterior/)
    expect(validarConfiguracion([], "2026-09-01", "2026-09-01", "2026-10-26")[0]).toMatch(/ciudad/)
    expect(validarConfiguracion(["Madrid"], "2026-11-01", "2026-11-02", "2026-10-26")[0]).toMatch(/futura/)
  })
})

describe("2. transformación de arrays paralelos", () => {
  it("crea un registro por hora con la fecha en UTC explícito", () => {
    const { registros, avisos } = transformarRespuesta("Madrid", respuestaCorrecta)
    expect(avisos).toEqual([])
    expect(registros).toHaveLength(3)
    expect(registros[1]).toMatchObject({
      ciudad: "Madrid",
      fecha_hora: "2026-09-01T01:00:00Z",
      temperatura_c: -3.2,
      humedad_pct: 70,
      precipitacion_mm: 0.4,
    })
  })

  it("no acepta horas imposibles ni texto sin formato", () => {
    expect(interpretarFechaUTC("2026-09-01T25:00")).toBeNull()
    expect(interpretarFechaUTC("2026-02-30T00:00")).toBeNull()
    expect(interpretarFechaUTC(null)).toBeNull()
    expect(interpretarFechaUTC("2026-09-01T23:00")).toBe("2026-09-01T23:00:00Z")
  })

  it("rechaza todas las filas si las longitudes no coinciden", () => {
    const { registros, avisos } = transformarRespuesta("Bilbao", respuestaIncoherente)
    expect(avisos[0]).toMatch(/incoherentes/)
    const { validos, rechazados } = limpiar(registros)
    expect(validos).toHaveLength(0)
    expect(rechazados.every((r) => r.motivos.includes("Arrays de longitud incoherente"))).toBe(true)
  })
})

describe("3. nulos y valores inválidos", () => {
  const { registros } = transformarRespuesta("Sevilla", respuestaConNulos)
  const { validos, rechazados } = limpiar(registros)

  it("conserva null en la transformación (no lo convierte en 0)", () => {
    expect(registros[0].temperatura_c).toBeNull()
    expect(registros[3].temperatura_c).toBe("")
  })

  it("rechaza con motivo cada caso y deja pasar solo la fila correcta", () => {
    const motivos = rechazados.map((r) => r.motivos.join(" | "))
    expect(motivos).toEqual([
      "Temperatura nula (null)",
      "Humedad nula (null)",
      "Humedad fuera de rango 0–100 (101)",
      'Temperatura vacía ("")',
      "Precipitación negativa (-0.1)",
      'Fecha/hora inválida ("2026-09-01T25:00")',
    ])
    expect(validos).toHaveLength(0)
    expect(validos.some((v) => v.temperatura_c === 0)).toBe(false)
  })

  it("no descarta temperaturas extremas", () => {
    const r = limpiar(transformarRespuesta("Sevilla", respuestaCorrecta).registros)
    expect(r.validos.map((v) => v.temperatura_c)).toEqual([20.5, -3.2, 48.9])
  })
})

describe("4. duplicados", () => {
  it("conserva la primera aparición y rechaza las siguientes", () => {
    const { validos, rechazados } = limpiar(transformarRespuesta("Valencia", respuestaConDuplicados).registros)
    expect(validos).toHaveLength(2)
    expect(validos.find((v) => v.fecha_hora === "2026-09-01T00:00:00Z")?.temperatura_c).toBe(10)
    expect(rechazados).toHaveLength(1)
    expect(rechazados[0].motivos[0]).toMatch(/Duplicado.*primera aparición \(fila 0\)/)
  })
})

// Conjunto sintético de 120 registros (5 ciudades × 24 h) para filtros y selección.
const CIUDADES = ["Barcelona", "Bilbao", "Madrid", "Sevilla", "Valencia"]
const datos: Medicion[] = CIUDADES.flatMap((ciudad, c) =>
  Array.from({ length: 24 }, (_, h) => ({
    ciudad,
    fecha_hora: `2026-09-01T${String(h).padStart(2, "0")}:00:00Z`,
    temperatura_c: 10 + c + h / 2,
    humedad_pct: 40 + h,
    precipitacion_mm: h % 6 === 0 ? 0.2 * (c + 1) : 0,
  }))
)

describe("5. filtros y ordenación antes de paginar", () => {
  it("la primera página es la de los datos ya filtrados y ordenados", () => {
    const f = { ...filtrosIniciales(CIUDADES), ciudades: ["Madrid", "Sevilla"], soloLluvia: true }
    const ordenados = ordenar(aplicarFiltros(datos, f), { campo: "temperatura_c", direccion: "desc" })
    expect(ordenados).toHaveLength(8)
    expect(ordenados.every((m) => m.precipitacion_mm > 0)).toBe(true)
    const pagina1 = paginar(ordenados, 0, 3)
    expect(pagina1.map((m) => m.temperatura_c)).toEqual([22, 21, 19])
    expect(pagina1[0].ciudad).toBe("Sevilla")
  })

  it("aplica rangos e intervalo de fecha en UTC", () => {
    const f = { ...filtrosIniciales(CIUDADES), desde: "2026-09-01T10:00", hasta: "2026-09-01T11:00", humMin: "51", tempMax: "17" }
    const r = aplicarFiltros(datos, f)
    expect(r.map((m) => `${m.ciudad} ${m.fecha_hora.slice(11, 13)}`)).toEqual([
      "Barcelona 11", "Bilbao 11",
    ])
  })
})

describe("6. selección entre páginas", () => {
  const ordenados = ordenar(datos, { campo: "fecha_hora", direccion: "asc" })

  it("seleccionar todo lo filtrado incluye filas de otras páginas", () => {
    const sel = new Set(ordenados.map(claveMedicion))
    expect(conjuntoCarga(ordenados, sel)).toHaveLength(120)
    expect(paginar(ordenados, 0, 25)).toHaveLength(25)
  })

  it("solo sube seleccionadas que siguen cumpliendo filtros y cuenta las de fuera", () => {
    const sel = new Set([paginar(ordenados, 0, 25)[0], paginar(ordenados, 3, 25)[0]].map(claveMedicion))
    const soloBilbao = ordenar(aplicarFiltros(datos, { ...filtrosIniciales(CIUDADES), ciudades: ["Bilbao"] }), { campo: "fecha_hora", direccion: "asc" })
    const aSubir = conjuntoCarga(soloBilbao, sel)
    expect(aSubir.every((m) => m.ciudad === "Bilbao")).toBe(true)
    expect(aSubir.length + seleccionadasFueraDeFiltros(soloBilbao, sel)).toBe(2)
  })

  it("cambiar filtros no añade filas a la selección", () => {
    const sel = new Set<string>()
    const amplio = aplicarFiltros(datos, filtrosIniciales(CIUDADES))
    expect(conjuntoCarga(amplio, sel)).toHaveLength(0)
  })
})

describe("7 y 9. carga por lotes", () => {
  const conjunto = ordenar(datos, { campo: "humedad_pct", direccion: "desc" })

  it("lo enviado coincide exactamente (contenido y orden) con la vista previa", async () => {
    const vistaPrevia = conjuntoCarga(conjunto, new Set(conjunto.map(claveMedicion)))
    const lotes = dividirEnLotes(vistaPrevia, 50)
    const enviados: Medicion[] = []
    await enviarLotes(lotes, lotesIniciales(lotes), [0, 1, 2], async (l) => { enviados.push(...l) }, () => {})
    expect(lotes.map((l) => l.length)).toEqual([50, 50, 20])
    expect(enviados).toEqual(vistaPrevia)
  })

  it("un fallo parcial conserva los lotes correctos y permite reintentar solo el fallido", async () => {
    const lotes = dividirEnLotes(conjunto, 50)
    const llamadas: number[] = []
    let fallar = true
    const enviar = async (l: Medicion[]) => {
      const i = lotes.indexOf(l)
      llamadas.push(i)
      if (i === 1 && fallar) throw new Error("Supabase: timeout simulado")
    }
    let estados = await enviarLotes(lotes, lotesIniciales(lotes), [0, 1, 2], enviar, () => {})
    expect(estados.map((e) => e.estado)).toEqual(["ok", "error", "ok"])
    expect(resumenLotes(estados)).toMatchObject({ correctos: 70, fallidos: 50, lotesFallidos: [1] })

    fallar = false
    estados = await enviarLotes(lotes, estados, resumenLotes(estados).lotesFallidos, enviar, () => {})
    expect(llamadas).toEqual([0, 1, 2, 1])
    expect(estados.map((e) => e.estado)).toEqual(["ok", "ok", "ok"])
    expect(estados[1].intentos).toBe(2)
    expect(resumenLotes(estados).correctos).toBe(120)
  })
})

describe("validación en servidor", () => {
  const ok = { ciudad: "Madrid", fecha_hora: "2026-09-01T00:00:00Z", temperatura_c: 20, humedad_pct: 50, precipitacion_mm: 0 }
  it("acepta un registro correcto", () => {
    expect(validarMedicionEntrante(ok)).toEqual({ medicion: { ...ok, fecha_hora: "2026-09-01T00:00:00.000Z" } })
  })
  it.each([
    [{ ...ok, temperatura_c: null }, /temperatura_c/],
    [{ ...ok, humedad_pct: 120 }, /Humedad/],
    [{ ...ok, fecha_hora: "2026-09-01T00:00" }, /UTC/],
    [{ ...ok, ciudad: "Atlantis" }, /Ciudad/],
    [{ ...ok, id: 1 }, /no permitidos/],
  ])("rechaza %j", (entrada, motivo) => {
    const r = validarMedicionEntrante(entrada)
    expect("errores" in r && r.errores.join(" ")).toMatch(motivo)
  })
})
