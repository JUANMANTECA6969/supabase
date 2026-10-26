const numero = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 })
const entero = new Intl.NumberFormat("es-ES")

export const fmtEntero = (n: number) => entero.format(n)
export const fmtNumero = (n: number) => numero.format(n)

/** "2026-09-01T05:00:00Z" → "2026-09-01 05:00 UTC" (siempre en UTC). */
export function fmtFechaUTC(iso: string | null | undefined): string {
  if (!iso) return "—"
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return String(iso)
  return `${new Date(ms).toISOString().slice(0, 16).replace("T", " ")} UTC`
}

/** Muestra un valor sin interpretar: null y undefined se ven tal cual, nunca 0. */
export function fmtCrudo(v: unknown): string {
  if (v === undefined) return "(ausente)"
  if (v === null) return "null"
  if (typeof v === "string") return JSON.stringify(v)
  if (typeof v === "number") return Number.isFinite(v) ? numero.format(v) : String(v)
  return JSON.stringify(v)
}

export function fmtDuracion(ms: number | undefined): string {
  if (ms === undefined) return "—"
  if (ms < 1) return "< 1 ms"
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}

/** Reloj monotónico para medir la duración real de cada fase. */
export const ahora = () => performance.now()
