import type { Medicion } from "./tipos"

export const TAM_LOTE = 500

export type EstadoLote = {
  indice: number
  /** Posición (base 0) de la primera fila del lote en el conjunto congelado. */
  desde: number
  cantidad: number
  estado: "pendiente" | "enviando" | "ok" | "error"
  error?: string
  duracionMs?: number
  intentos: number
}

export function dividirEnLotes<T>(filas: T[], tamano = TAM_LOTE): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < filas.length; i += tamano) lotes.push(filas.slice(i, i + tamano))
  return lotes
}

export function lotesIniciales(lotes: Medicion[][]): EstadoLote[] {
  let desde = 0
  return lotes.map((l, indice) => {
    const e: EstadoLote = { indice, desde, cantidad: l.length, estado: "pendiente", intentos: 0 }
    desde += l.length
    return e
  })
}

/**
 * Envía secuencialmente los lotes indicados. Un fallo no detiene el resto ni
 * altera los lotes ya completados. `enviar` debe lanzar si el lote falla.
 */
export async function enviarLotes(
  lotes: Medicion[][],
  estados: EstadoLote[],
  indices: number[],
  enviar: (lote: Medicion[]) => Promise<void>,
  alActualizar: (estados: EstadoLote[]) => void
): Promise<EstadoLote[]> {
  let actual = estados.map((e) => ({ ...e }))
  const fijar = (i: number, cambio: Partial<EstadoLote>) => {
    actual = actual.map((e) => (e.indice === i ? { ...e, ...cambio } : e))
    alActualizar(actual)
  }
  for (const i of indices) {
    const intentos = actual[i].intentos + 1
    fijar(i, { estado: "enviando", error: undefined, intentos })
    const t0 = performance.now()
    try {
      await enviar(lotes[i])
      fijar(i, { estado: "ok", duracionMs: performance.now() - t0 })
    } catch (e) {
      fijar(i, {
        estado: "error",
        error: e instanceof Error ? e.message : String(e),
        duracionMs: performance.now() - t0,
      })
    }
  }
  return actual
}

export function resumenLotes(estados: EstadoLote[]) {
  const sum = (estado: EstadoLote["estado"]) =>
    estados.filter((e) => e.estado === estado).reduce((s, e) => s + e.cantidad, 0)
  return {
    correctos: sum("ok"),
    fallidos: sum("error"),
    pendientes: sum("pendiente") + sum("enviando"),
    lotesFallidos: estados.filter((e) => e.estado === "error").map((e) => e.indice),
  }
}
