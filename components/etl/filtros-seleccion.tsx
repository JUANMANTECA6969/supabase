"use client"

import { useState } from "react"
import { ArrowDownUpIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Filtros } from "@/lib/etl/filtros"
import { fmtEntero, fmtFechaUTC, fmtNumero } from "@/lib/etl/formato"
import { claveMedicion } from "@/lib/etl/limpieza"
import type { CampoOrden, Medicion, Orden } from "@/lib/etl/tipos"

import { Paginacion, TAMANOS_PAGINA, Tabla, type Columna } from "./tabla-paginada"

export const ETIQUETAS_CAMPO: Record<CampoOrden, string> = {
  ciudad: "Ciudad",
  fecha_hora: "Fecha y hora (UTC)",
  temperatura_c: "Temperatura (°C)",
  humedad_pct: "Humedad (%)",
  precipitacion_mm: "Precipitación (mm)",
}

export const columnasMedicion: Columna<Medicion>[] = [
  { id: "ciudad", encabezado: "Ciudad", celda: (m) => m.ciudad },
  { id: "fecha_hora", encabezado: "Fecha y hora (UTC)", celda: (m) => fmtFechaUTC(m.fecha_hora) },
  { id: "t", encabezado: "Temperatura (°C)", celda: (m) => fmtNumero(m.temperatura_c), className: "text-right" },
  { id: "h", encabezado: "Humedad (%)", celda: (m) => fmtNumero(m.humedad_pct), className: "text-right" },
  { id: "p", encabezado: "Precipitación (mm)", celda: (m) => fmtNumero(m.precipitacion_mm), className: "text-right" },
]

function Rango({
  etiqueta,
  unidad,
  min,
  max,
  onMin,
  onMax,
  paso = "0.1",
}: {
  etiqueta: string
  unidad: string
  min: string
  max: string
  onMin: (v: string) => void
  onMax: (v: string) => void
  paso?: string
}) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs font-medium">
        {etiqueta} <span className="text-muted-foreground">({unidad})</span>
      </legend>
      <div className="flex gap-1">
        <Input type="number" step={paso} placeholder="mín." aria-label={`${etiqueta} mínima`} value={min} onChange={(e) => onMin(e.target.value)} />
        <Input type="number" step={paso} placeholder="máx." aria-label={`${etiqueta} máxima`} value={max} onChange={(e) => onMax(e.target.value)} />
      </div>
    </fieldset>
  )
}

export function PanelFiltros({
  filtros,
  onFiltros,
  orden,
  onOrden,
  ciudadesDisponibles,
  avisos,
  onRestablecer,
}: {
  filtros: Filtros
  onFiltros: (f: Filtros) => void
  orden: Orden
  onOrden: (o: Orden) => void
  ciudadesDisponibles: string[]
  avisos: string[]
  onRestablecer: () => void
}) {
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => onFiltros({ ...filtros, [k]: v })
  return (
    <section aria-label="Filtros y ordenación" className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Filtros y ordenación</h3>
        <Button variant="outline" size="sm" onClick={onRestablecer}>
          <RotateCcwIcon /> Restablecer filtros
        </Button>
      </div>
      <fieldset>
        <legend className="mb-1 text-xs font-medium">Ciudades</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {ciudadesDisponibles.map((c) => (
            <label key={c} className="flex items-center gap-1.5 text-sm">
              <Checkbox
                checked={filtros.ciudades.includes(c)}
                onCheckedChange={(v) =>
                  set("ciudades", v ? [...filtros.ciudades, c] : filtros.ciudades.filter((x) => x !== c))
                }
              />
              {c}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-desde" className="text-xs">Desde (UTC)</Label>
          <Input id="f-desde" type="datetime-local" value={filtros.desde} onChange={(e) => set("desde", e.target.value)} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-hasta" className="text-xs">Hasta (UTC)</Label>
          <Input id="f-hasta" type="datetime-local" value={filtros.hasta} onChange={(e) => set("hasta", e.target.value)} />
        </div>
        <Rango etiqueta="Temperatura" unidad="°C" min={filtros.tempMin} max={filtros.tempMax} onMin={(v) => set("tempMin", v)} onMax={(v) => set("tempMax", v)} />
        <Rango etiqueta="Humedad" unidad="%" min={filtros.humMin} max={filtros.humMax} onMin={(v) => set("humMin", v)} onMax={(v) => set("humMax", v)} paso="1" />
        <Rango etiqueta="Precipitación" unidad="mm" min={filtros.precMin} max={filtros.precMax} onMin={(v) => set("precMin", v)} onMax={(v) => set("precMax", v)} />
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-1.5 text-sm">
          <Checkbox checked={filtros.soloLluvia} onCheckedChange={(v) => set("soloLluvia", v)} />
          Solo registros con lluvia <span className="text-muted-foreground">(precipitación &gt; 0 mm)</span>
        </label>
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="orden-campo" className="text-xs">Ordenar por</Label>
            <select
              id="orden-campo"
              className="h-8 rounded-md border bg-background px-2 text-sm"
              value={orden.campo}
              onChange={(e) => onOrden({ ...orden, campo: e.target.value as CampoOrden })}
            >
              {Object.entries(ETIQUETAS_CAMPO).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOrden({ ...orden, direccion: orden.direccion === "asc" ? "desc" : "asc" })}
            aria-label={`Dirección: ${orden.direccion === "asc" ? "ascendente" : "descendente"}. Pulsa para invertir.`}
          >
            <ArrowDownUpIcon /> {orden.direccion === "asc" ? "Ascendente" : "Descendente"}
          </Button>
        </div>
      </div>
      {avisos.length > 0 && (
        <ul className="list-inside list-disc text-xs text-amber-700 dark:text-amber-300" role="status">
          {avisos.map((a) => <li key={a}>⚠ {a}</li>)}
        </ul>
      )}
    </section>
  )
}

/** Tabla de registros filtrados y ordenados con selección persistente. */
export function TablaSeleccion({
  ordenados,
  seleccion,
  onSeleccion,
  fueraDeFiltros,
  bloqueada,
}: {
  ordenados: Medicion[]
  seleccion: ReadonlySet<string>
  onSeleccion: (s: Set<string>) => void
  fueraDeFiltros: number
  bloqueada: boolean
}) {
  const [pagina, setPagina] = useState(0)
  const [tamano, setTamano] = useState(TAMANOS_PAGINA[0])
  const paginas = Math.max(1, Math.ceil(ordenados.length / tamano))
  const actual = Math.min(pagina, paginas - 1)
  // La paginación se aplica DESPUÉS de filtrar y ordenar: solo afecta a la vista.
  const visibles = ordenados.slice(actual * tamano, (actual + 1) * tamano)
  const clavesPagina = visibles.map(claveMedicion)
  const marcadasPagina = clavesPagina.filter((k) => seleccion.has(k)).length
  const enFiltros = ordenados.length
  const seleccionadasEnFiltros = seleccion.size - fueraDeFiltros

  const alternar = (claves: string[], marcar: boolean) => {
    const nueva = new Set(seleccion)
    for (const k of claves) {
      if (marcar) nueva.add(k)
      else nueva.delete(k)
    }
    onSeleccion(nueva)
  }

  const columnas: Columna<Medicion>[] = [
    {
      id: "sel",
      encabezado: (
        <Checkbox
          aria-label="Seleccionar las filas de esta página"
          disabled={bloqueada || visibles.length === 0}
          checked={visibles.length > 0 && marcadasPagina === visibles.length}
          indeterminate={marcadasPagina > 0 && marcadasPagina < visibles.length}
          onCheckedChange={(v) => alternar(clavesPagina, v)}
        />
      ),
      celda: (m) => (
        <Checkbox
          aria-label={`Seleccionar ${m.ciudad} ${fmtFechaUTC(m.fecha_hora)}`}
          disabled={bloqueada}
          checked={seleccion.has(claveMedicion(m))}
          onCheckedChange={(v) => alternar([claveMedicion(m)], v)}
        />
      ),
      className: "w-8",
    },
    ...columnasMedicion,
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" disabled={bloqueada || enFiltros === 0} onClick={() => alternar(ordenados.map(claveMedicion), true)}>
          Seleccionar las {fmtEntero(enFiltros)} filas que cumplen los filtros
        </Button>
        <Button size="sm" variant="outline" disabled={bloqueada || seleccion.size === 0} onClick={() => onSeleccion(new Set())}>
          Vaciar selección
        </Button>
        <span className="text-xs text-muted-foreground" aria-live="polite">
          {fmtEntero(seleccionadasEnFiltros)} seleccionadas dentro de los filtros
          {bloqueada && " · selección bloqueada mientras se sube a Supabase"}
        </span>
      </div>
      {fueraDeFiltros > 0 && (
        <p role="status" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          ⚠ {fmtEntero(fueraDeFiltros)} fila(s) seleccionada(s) quedan fuera de los filtros actuales y{" "}
          <strong>no se subirán</strong>. Siguen marcadas por si vuelves a ampliar los filtros.
        </p>
      )}
      <Tabla
        columnas={columnas}
        filas={visibles}
        claveFila={claveMedicion}
        vacio="Ningún registro válido cumple los filtros."
        claseFila={(m) => (seleccion.has(claveMedicion(m)) ? "bg-primary/5" : undefined)}
      />
      <Paginacion
        pagina={actual}
        total={ordenados.length}
        tamano={tamano}
        onPagina={setPagina}
        onTamano={(t) => {
          setTamano(t)
          setPagina(0)
        }}
      />
    </div>
  )
}
