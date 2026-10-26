"use client"

import { useCallback, useEffect, useState } from "react"
import { ArrowDownUpIcon, DatabaseIcon, RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NOMBRES_CIUDADES } from "@/lib/etl/extraccion"
import { fmtFechaUTC, fmtNumero } from "@/lib/etl/formato"

import { ETIQUETAS_CAMPO } from "./filtros-seleccion"
import { Paginacion, Tabla, type Columna } from "./tabla-paginada"

type Fila = {
  id: number
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
  importado_en: string
}

const ORDENES = { ...ETIQUETAS_CAMPO, importado_en: "Importado en (UTC)" }

const columnas: Columna<Fila>[] = [
  { id: "id", encabezado: "id", celda: (f) => f.id, className: "text-muted-foreground" },
  { id: "ciudad", encabezado: "Ciudad", celda: (f) => f.ciudad },
  { id: "fecha", encabezado: "Fecha y hora (UTC)", celda: (f) => fmtFechaUTC(f.fecha_hora) },
  { id: "t", encabezado: "Temperatura (°C)", celda: (f) => fmtNumero(f.temperatura_c), className: "text-right" },
  { id: "h", encabezado: "Humedad (%)", celda: (f) => fmtNumero(f.humedad_pct), className: "text-right" },
  { id: "p", encabezado: "Precipitación (mm)", celda: (f) => fmtNumero(f.precipitacion_mm), className: "text-right" },
  { id: "imp", encabezado: "Importado en (UTC)", celda: (f) => fmtFechaUTC(f.importado_en) },
]

const aUTC = (v: string) => (v ? `${v}:00Z` : "")

/** Lectura real de la tabla de destino a través de /api/mediciones. */
export function DatosSupabase({ version }: { version: number }) {
  const [ciudades, setCiudades] = useState<string[]>([])
  const [desde, setDesde] = useState("")
  const [hasta, setHasta] = useState("")
  const [orden, setOrden] = useState("fecha_hora")
  const [direccion, setDireccion] = useState<"asc" | "desc">("asc")
  const [pagina, setPagina] = useState(0)
  const [tamano, setTamano] = useState(25)
  const [estado, setEstado] = useState<{
    cargando: boolean
    error?: string
    filas: Fila[]
    total: number
    leidoEn?: string
  }>({ cargando: false, filas: [], total: 0 })

  const leer = useCallback(async () => {
    setEstado((e) => ({ ...e, cargando: true, error: undefined }))
    const params = new URLSearchParams({
      pagina: String(pagina),
      tamano: String(tamano),
      orden,
      direccion,
      ciudades: ciudades.join(","),
      desde: aUTC(desde),
      hasta: aUTC(hasta),
    })
    try {
      const r = await fetch(`/api/mediciones?${params}`, { cache: "no-store" })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`)
      setEstado({ cargando: false, filas: j.filas, total: j.total, leidoEn: new Date().toISOString() })
    } catch (e) {
      setEstado({ cargando: false, filas: [], total: 0, error: e instanceof Error ? e.message : String(e) })
    }
  }, [pagina, tamano, orden, direccion, ciudades, desde, hasta])

  useEffect(() => {
    // Lectura inicial y al cambiar filtros, página o tras una carga (version).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void leer()
  }, [leer, version])

  const cambiar = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v)
    setPagina(0)
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="flex items-start gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
        <DatabaseIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          <strong>Datos persistidos.</strong> Esta tabla se lee de Supabase en el servidor; no muestra los registros locales pendientes de subir. El orden lo fija la consulta (ORDER BY), no el orden de inserción.
        </span>
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <fieldset>
          <legend className="mb-1 text-xs font-medium">Ciudades (ninguna = todas)</legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {NOMBRES_CIUDADES.map((c) => (
              <label key={c} className="flex items-center gap-1 text-sm">
                <Checkbox
                  checked={ciudades.includes(c)}
                  onCheckedChange={(v) => cambiar(setCiudades)(v ? [...ciudades, c] : ciudades.filter((x) => x !== c))}
                />
                {c}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1">
          <Label htmlFor="s-desde" className="text-xs">Desde (UTC)</Label>
          <Input id="s-desde" type="datetime-local" value={desde} onChange={(e) => cambiar(setDesde)(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="s-hasta" className="text-xs">Hasta (UTC)</Label>
          <Input id="s-hasta" type="datetime-local" value={hasta} onChange={(e) => cambiar(setHasta)(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="s-orden" className="text-xs">Ordenar por</Label>
          <select id="s-orden" className="h-8 rounded-md border bg-background px-2 text-sm" value={orden} onChange={(e) => cambiar(setOrden)(e.target.value)}>
            {Object.entries(ORDENES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={() => cambiar(setDireccion)(direccion === "asc" ? "desc" : "asc")}>
          <ArrowDownUpIcon /> {direccion === "asc" ? "Ascendente" : "Descendente"}
        </Button>
        <Button size="sm" onClick={() => void leer()} disabled={estado.cargando}>
          <RefreshCwIcon className={estado.cargando ? "animate-spin" : undefined} /> Actualizar
        </Button>
      </div>
      {estado.error ? (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          ✖ No se pudo leer Supabase: {estado.error}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {estado.cargando ? "Leyendo…" : estado.leidoEn && `Leído a las ${fmtFechaUTC(estado.leidoEn)}.`}
        </p>
      )}
      <Tabla columnas={columnas} filas={estado.filas} claveFila={(f) => String(f.id)} vacio="La tabla no tiene registros con estos filtros." />
      <Paginacion pagina={pagina} total={estado.total} tamano={tamano} onPagina={setPagina} onTamano={cambiar(setTamano)} />
    </div>
  )
}
