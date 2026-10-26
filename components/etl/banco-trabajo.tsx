"use client"

import { useMemo, useRef, useState } from "react"
import {
  CloudUploadIcon,
  DownloadIcon,
  InfoIcon,
  PlayIcon,
  RotateCwIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  TAM_LOTE,
  dividirEnLotes,
  enviarLotes,
  lotesIniciales,
  resumenLotes,
  type EstadoLote,
} from "@/lib/etl/carga"
import {
  CIUDADES,
  MAX_DIAS,
  PERIODO_INICIAL,
  construirUrl,
  descargarCiudad,
  diasEntre,
  validarConfiguracion,
} from "@/lib/etl/extraccion"
import {
  ORDEN_INICIAL,
  aplicarFiltros,
  avisosFiltros,
  conjuntoCarga,
  filtrosIniciales,
  ordenar,
  seleccionadasFueraDeFiltros,
  type Filtros,
} from "@/lib/etl/filtros"
import { ahora, fmtCrudo, fmtDuracion, fmtEntero, fmtFechaUTC } from "@/lib/etl/formato"
import { claveMedicion, limpiar } from "@/lib/etl/limpieza"
import type {
  EstadoFase,
  ExtraccionCiudad,
  Medicion,
  Orden,
  Rechazo,
  RegistroTransformado,
} from "@/lib/etl/tipos"
import { transformarRespuesta } from "@/lib/etl/transformacion"
import { cn } from "@/lib/utils"

import { DatosSupabase } from "./datos-supabase"
import { PanelFiltros, TablaSeleccion, columnasMedicion } from "./filtros-seleccion"
import { EstadoBadge, Pipeline, type Fase } from "./pipeline"
import { TablaPaginada, type Columna } from "./tabla-paginada"

type Clave = { ciudad: string; fecha_hora: string }

type Verificacion =
  | { estado: "en_curso" }
  | { estado: "error"; error: string }
  | { estado: "completada"; comprobadas: number; encontradas: number; faltan: Clave[] }

type EstadoCarga = {
  /** Copia congelada del conjunto y su orden en el momento de pulsar «Subir». */
  congelado: Medicion[]
  lotes: Medicion[][]
  estados: EstadoLote[]
  enCurso: boolean
  inicio: number
  duracionMs?: number
  verificacion?: Verificacion
}

function descargar(nombre: string, datos: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(datos, null, 2)], { type: "application/json" }))
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

async function enviarLote(lote: Medicion[]) {
  const r = await fetch("/api/carga", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registros: lote }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    const detalle = Array.isArray(j.detalles)
      ? ` (fila ${j.detalles[0].fila}: ${j.detalles[0].errores.join("; ")})`
      : ""
    throw new Error(`${j.error ?? `HTTP ${r.status}`}${detalle}`)
  }
}

async function verificarClaves(claves: Clave[]): Promise<Verificacion> {
  let encontradas = 0
  const faltan: Clave[] = []
  for (const tramo of dividirEnLotes(claves, TAM_LOTE)) {
    const r = await fetch("/api/verificacion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claves: tramo }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) return { estado: "error", error: j.error ?? `HTTP ${r.status}` }
    encontradas += j.encontradas
    faltan.push(...j.faltan)
  }
  return { estado: "completada", comprobadas: claves.length, encontradas, faltan }
}

function Contador({ etiqueta, valor, ayuda, destacado }: { etiqueta: string; valor: number; ayuda: string; destacado?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", destacado && "border-primary bg-primary/5")}>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{fmtEntero(valor)}</dd>
      <dd className="text-[11px] leading-tight text-muted-foreground">{ayuda}</dd>
    </div>
  )
}

const columnasTransformadas: Columna<RegistroTransformado>[] = [
  { id: "ciudad", encabezado: "ciudad", celda: (r) => r.ciudad ?? "null" },
  { id: "i", encabezado: "Índice en arrays", celda: (r) => r.indice, className: "text-right" },
  { id: "orig", encabezado: "time (original)", celda: (r) => <code className="text-xs">{fmtCrudo(r.fecha_hora_original)}</code> },
  { id: "fh", encabezado: "fecha_hora (UTC)", celda: (r) => (r.fecha_hora ? fmtFechaUTC(r.fecha_hora) : <Nulo texto="inválida" />) },
  { id: "t", encabezado: "temperatura_c (°C)", celda: (r) => <Crudo v={r.temperatura_c} />, className: "text-right" },
  { id: "h", encabezado: "humedad_pct (%)", celda: (r) => <Crudo v={r.humedad_pct} />, className: "text-right" },
  { id: "p", encabezado: "precipitacion_mm (mm)", celda: (r) => <Crudo v={r.precipitacion_mm} />, className: "text-right" },
]

function Nulo({ texto }: { texto: string }) {
  return <span className="rounded bg-amber-100 px-1 font-mono text-xs text-amber-900 dark:bg-amber-950 dark:text-amber-200">{texto}</span>
}

function Crudo({ v }: { v: unknown }) {
  return typeof v === "number" && Number.isFinite(v) ? <>{fmtCrudo(v)}</> : <Nulo texto={fmtCrudo(v)} />
}

const deRegistro = (c: Columna<RegistroTransformado>): Columna<Rechazo> => ({
  ...c,
  celda: (r) => c.celda(r.registro),
})

const columnasRechazos: Columna<Rechazo>[] = [
  deRegistro(columnasTransformadas[0]),
  ...columnasTransformadas.slice(3).map(deRegistro),
  {
    id: "motivo",
    encabezado: "Motivo del rechazo",
    celda: (r) => (
      <ul className="text-xs text-red-800 dark:text-red-300">
        {r.motivos.map((m) => <li key={m}>✖ {m}</li>)}
      </ul>
    ),
  },
]

const columnasCarga: Columna<Medicion & { posicion: number }>[] = [
  { id: "pos", encabezado: "Orden de envío", celda: (m) => m.posicion, className: "text-right text-muted-foreground" },
  { id: "lote", encabezado: "Lote", celda: (m) => Math.floor((m.posicion - 1) / TAM_LOTE) + 1, className: "text-right text-muted-foreground" },
  ...(columnasMedicion as Columna<Medicion & { posicion: number }>[]),
]

export function BancoTrabajo() {
  // ── Configuración ──────────────────────────────────────────────
  const [ciudadesSel, setCiudadesSel] = useState<string[]>(CIUDADES.map((c) => c.nombre))
  const [inicio, setInicio] = useState(PERIODO_INICIAL.inicio)
  const [fin, setFin] = useState(PERIODO_INICIAL.fin)
  const [intentoEnviado, setIntentoEnviado] = useState(false)
  const errores = validarConfiguracion(ciudadesSel, inicio, fin)
  const dias = diasEntre(inicio, fin)

  // ── Extracción ─────────────────────────────────────────────────
  const [extracciones, setExtracciones] = useState<ExtraccionCiudad[]>([])
  const [periodo, setPeriodo] = useState<{ inicio: string; fin: string } | null>(null)
  const [tiempoExtraccion, setTiempoExtraccion] = useState<{ inicio: number; fin?: number } | null>(null)
  const [jsonVisible, setJsonVisible] = useState<string | null>(null)
  const extrayendo = extracciones.some((e) => e.estado === "en_curso")

  // ── Filtros, orden y selección ─────────────────────────────────
  const [filtros, setFiltros] = useState<Filtros>(filtrosIniciales([]))
  const [orden, setOrden] = useState<Orden>(ORDEN_INICIAL)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())

  // ── Carga ──────────────────────────────────────────────────────
  const [carga, setCarga] = useState<EstadoCarga | null>(null)
  const bloqueoCarga = useRef(false)
  const [versionDestino, setVersionDestino] = useState(0)
  const [pestana, setPestana] = useState("json")

  const actualizarCiudad = (ciudad: string, cambio: Partial<ExtraccionCiudad>) =>
    setExtracciones((lista) => lista.map((e) => (e.ciudad === ciudad ? { ...e, ...cambio } : e)))

  async function extraerCiudad(ciudad: string, url: string) {
    actualizarCiudad(ciudad, { estado: "en_curso", error: undefined })
    const t0 = ahora()
    try {
      const json = await descargarCiudad(url)
      const time = (json as { hourly?: { time?: unknown } })?.hourly?.time
      // Reemplaza (no añade) el JSON de la ciudad: reintentar nunca duplica filas.
      actualizarCiudad(ciudad, {
        estado: "completada",
        json,
        horas: Array.isArray(time) ? time.length : 0,
        duracionMs: ahora() - t0,
      })
    } catch (e) {
      actualizarCiudad(ciudad, {
        estado: "error",
        json: undefined,
        horas: undefined,
        error: e instanceof Error ? e.message : String(e),
        duracionMs: ahora() - t0,
      })
    }
  }

  async function extraer() {
    setIntentoEnviado(true)
    if (errores.length || extrayendo || carga?.enCurso) return
    const ciudades = CIUDADES.filter((c) => ciudadesSel.includes(c.nombre))
    const lista = ciudades.map((c): ExtraccionCiudad => ({
      ciudad: c.nombre,
      estado: "pendiente",
      url: construirUrl(c, inicio, fin),
    }))
    setExtracciones(lista)
    setPeriodo({ inicio, fin })
    setFiltros(filtrosIniciales(lista.map((e) => e.ciudad)))
    setOrden(ORDEN_INICIAL)
    setSeleccion(new Set())
    setCarga(null)
    setJsonVisible(lista[0]?.ciudad ?? null)
    const t0 = ahora()
    setTiempoExtraccion({ inicio: t0 })
    // Secuencial: una petición por ciudad para poder reintentar por separado.
    for (const e of lista) await extraerCiudad(e.ciudad, e.url)
    setTiempoExtraccion({ inicio: t0, fin: ahora() })
  }

  async function reintentar(ciudad: string) {
    const e = extracciones.find((x) => x.ciudad === ciudad)
    if (!e || extrayendo || carga?.enCurso) return
    const t0 = ahora()
    setTiempoExtraccion({ inicio: t0 })
    await extraerCiudad(ciudad, e.url)
    setTiempoExtraccion({ inicio: t0, fin: ahora() })
  }

  // ── Transformación y limpieza (solo cuando no hay descargas en curso) ──
  const procesado = useMemo(() => {
    const completadas = extracciones.filter((e) => e.estado === "completada")
    if (extrayendo || completadas.length === 0) return null
    const t0 = ahora()
    const transformados: RegistroTransformado[] = []
    const avisos: string[] = []
    for (const e of completadas) {
      const r = transformarRespuesta(e.ciudad, e.json)
      transformados.push(...r.registros)
      avisos.push(...r.avisos)
    }
    const t1 = ahora()
    const { validos, rechazados } = limpiar(transformados)
    const t2 = ahora()
    return {
      horasRecibidas: completadas.reduce((s, e) => s + (e.horas ?? 0), 0),
      transformados,
      avisos,
      validos,
      rechazados,
      durTransformacion: t1 - t0,
      durLimpieza: t2 - t1,
    }
  }, [extracciones, extrayendo])

  // ── Orden obligatorio: válidos → filtros → ordenación → selección → carga ──
  const filtrado = useMemo(() => {
    const t0 = ahora()
    const coinciden = aplicarFiltros(procesado?.validos ?? [], filtros)
    const ordenados = ordenar(coinciden, orden)
    const aSubir = conjuntoCarga(ordenados, seleccion)
    return {
      ordenados,
      aSubir,
      fuera: seleccionadasFueraDeFiltros(ordenados, seleccion),
      duracionMs: ahora() - t0,
    }
  }, [procesado, filtros, orden, seleccion])

  const ciudadesDisponibles = extracciones.filter((e) => e.estado === "completada").map((e) => e.ciudad)

  async function subir() {
    // Doble protección: el ref evita dobles clics antes de que React repinte.
    if (bloqueoCarga.current || filtrado.aSubir.length === 0) return
    bloqueoCarga.current = true
    const congelado = filtrado.aSubir.map((m) => ({ ...m }))
    const lotes = dividirEnLotes(congelado)
    const t0 = ahora()
    const base: EstadoCarga = { congelado, lotes, estados: lotesIniciales(lotes), enCurso: true, inicio: t0 }
    setCarga(base)
    setPestana("carga")
    await ejecutar(base, lotes.map((_, i) => i))
  }

  async function reintentarLotes() {
    if (!carga || bloqueoCarga.current) return
    const fallidos = resumenLotes(carga.estados).lotesFallidos
    if (fallidos.length === 0) return
    bloqueoCarga.current = true
    const base = { ...carga, enCurso: true, inicio: ahora(), verificacion: undefined }
    setCarga(base)
    await ejecutar(base, fallidos)
  }

  async function ejecutar(base: EstadoCarga, indices: number[]) {
    try {
      const estados = await enviarLotes(base.lotes, base.estados, indices, enviarLote, (est) =>
        setCarga((c) => (c ? { ...c, estados: est } : c))
      )
      const duracionMs = ahora() - base.inicio
      // Verificación: solo las claves de los lotes que el servidor confirmó.
      const claves = estados
        .filter((e) => e.estado === "ok")
        .flatMap((e) => base.lotes[e.indice].map(({ ciudad, fecha_hora }) => ({ ciudad, fecha_hora })))
      setCarga((c) => (c ? { ...c, estados, duracionMs, verificacion: claves.length ? { estado: "en_curso" } : undefined } : c))
      if (claves.length) {
        const verificacion = await verificarClaves(claves)
        setCarga((c) => (c ? { ...c, verificacion } : c))
      }
    } finally {
      setCarga((c) => (c ? { ...c, enCurso: false } : c))
      bloqueoCarga.current = false
      setVersionDestino((v) => v + 1)
    }
  }

  // ── Estados de las fases ───────────────────────────────────────
  const estadoExtraccion: EstadoFase =
    extracciones.length === 0
      ? "pendiente"
      : extrayendo || extracciones.some((e) => e.estado === "pendiente")
        ? "en_curso"
        : extracciones.some((e) => e.estado === "error")
          ? "error"
          : "completada"
  const resumen = carga ? resumenLotes(carga.estados) : null
  const estadoCarga: EstadoFase = !carga
    ? "pendiente"
    : carga.enCurso
      ? "en_curso"
      : resumen!.fallidos > 0 || carga.verificacion?.estado === "error" || (carga.verificacion?.estado === "completada" && carga.verificacion.faltan.length > 0)
        ? "error"
        : "completada"

  const fases: Fase[] = [
    {
      id: "extraccion",
      numero: 1,
      titulo: "Extracción",
      explicacion: "Una petición GET por ciudad a la API histórica de Open-Meteo (UTC, °C, mm). Se guarda el JSON original.",
      estado: estadoExtraccion,
      entrada: extracciones.length ? { valor: extracciones.length, etiqueta: "ciudades" } : undefined,
      salida: extracciones.length ? { valor: extracciones.reduce((s, e) => s + (e.horas ?? 0), 0), etiqueta: "horas" } : undefined,
      duracionMs: tiempoExtraccion?.fin !== undefined ? tiempoExtraccion.fin - tiempoExtraccion.inicio : undefined,
      pestana: "json",
      extra: extracciones.length > 0 && (
        <ul className="flex flex-col gap-1 text-xs" aria-label="Estado por ciudad">
          {extracciones.map((e) => (
            <li key={e.ciudad} className="flex items-center justify-between gap-1">
              <span>{e.ciudad}</span>
              <EstadoBadge estado={e.estado} className="px-1.5 text-[10px]" />
            </li>
          ))}
        </ul>
      ),
    },
    {
      id: "transformacion",
      numero: 2,
      titulo: "Transformación",
      explicacion: "Los arrays paralelos (time, temperature_2m…) se convierten en un registro por ciudad y hora, con fecha interpretada como UTC.",
      estado: !procesado ? "pendiente" : procesado.avisos.length ? "error" : "completada",
      entrada: procesado ? { valor: procesado.horasRecibidas, etiqueta: "horas" } : undefined,
      salida: procesado ? { valor: procesado.transformados.length, etiqueta: "registros" } : undefined,
      duracionMs: procesado?.durTransformacion,
      pestana: "transformados",
      extra: procesado && procesado.avisos.length > 0 && <p className="text-xs text-red-700 dark:text-red-300">✖ {procesado.avisos.length} aviso(s) de estructura</p>,
    },
    {
      id: "limpieza",
      numero: 3,
      titulo: "Limpieza",
      explicacion: "Se rechazan filas sin ciudad, fecha o alguna medición, valores no finitos, humedad fuera de 0–100, lluvia negativa y duplicados.",
      estado: procesado ? "completada" : "pendiente",
      entrada: procesado ? { valor: procesado.transformados.length, etiqueta: "registros" } : undefined,
      salida: procesado ? { valor: procesado.validos.length, etiqueta: "válidos" } : undefined,
      duracionMs: procesado?.durLimpieza,
      pestana: "rechazados",
      extra: procesado && <p className="text-xs text-muted-foreground">{fmtEntero(procesado.rechazados.length)} rechazados por calidad</p>,
    },
    {
      id: "filtrado",
      numero: 4,
      titulo: "Filtrado y selección",
      explicacion: "Sobre los válidos: filtros → ordenación → selección manual. Las exclusiones por filtro no son errores de calidad.",
      estado: procesado ? "completada" : "pendiente",
      entrada: procesado ? { valor: procesado.validos.length, etiqueta: "válidos" } : undefined,
      salida: procesado ? { valor: filtrado.aSubir.length, etiqueta: "a subir" } : undefined,
      duracionMs: procesado ? filtrado.duracionMs : undefined,
      pestana: "validos",
      extra: procesado && <p className="text-xs text-muted-foreground">{fmtEntero(filtrado.ordenados.length)} coinciden con los filtros</p>,
    },
    {
      id: "carga",
      numero: 5,
      titulo: "Carga",
      explicacion: `Upsert en Supabase por (ciudad, fecha_hora), en lotes de ${TAM_LOTE}, desde el servidor. Después se verifica que las claves existen.`,
      estado: estadoCarga,
      entrada: carga ? { valor: carga.congelado.length, etiqueta: "registros" } : undefined,
      salida: resumen ? { valor: resumen.correctos, etiqueta: "procesados" } : undefined,
      duracionMs: carga?.duracionMs,
      pestana: "carga",
      extra: carga && (
        <p className="text-xs text-muted-foreground">
          Lotes: {carga.estados.filter((e) => e.estado === "ok").length}/{carga.estados.length} correctos
          {resumen!.fallidos > 0 && `, ${resumen!.lotesFallidos.length} con error`}
        </p>
      ),
    },
  ]

  const enviando = carga?.enCurso ?? false
  const enCursoCiudad = extracciones.find((e) => e.estado === "en_curso")
  const pendientesCiudad = extracciones.filter((e) => e.estado === "pendiente")
  const extraccionJson = extracciones.find((e) => e.ciudad === jsonVisible)

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline ETL: Open-Meteo → Supabase</h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Práctica de Big Data. Extrae datos horarios históricos, observa cómo cambian en cada fase y decide exactamente qué registros se cargan en la tabla <code>mediciones_meteorologicas</code>.
        </p>
      </header>

      {/* 1. CONFIGURACIÓN */}
      <section aria-labelledby="t-config" className="rounded-lg border p-4">
        <h2 id="t-config" className="mb-3 text-base font-semibold">1. Configuración de la extracción</h2>
        <div className="grid gap-4 md:grid-cols-[2fr_1fr_1fr_auto] md:items-end">
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Ciudades</legend>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {CIUDADES.map((c) => (
                <label key={c.nombre} className="flex items-center gap-1.5 text-sm" title={`${c.latitud}, ${c.longitud}`}>
                  <Checkbox
                    checked={ciudadesSel.includes(c.nombre)}
                    onCheckedChange={(v) => setCiudadesSel((s) => (v ? [...s, c.nombre] : s.filter((x) => x !== c.nombre)))}
                  />
                  {c.nombre}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-col gap-1">
            <Label htmlFor="inicio">Fecha inicial</Label>
            <Input id="inicio" type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} aria-invalid={intentoEnviado && errores.length > 0} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fin">Fecha final</Label>
            <Input id="fin" type="date" value={fin} onChange={(e) => setFin(e.target.value)} aria-invalid={intentoEnviado && errores.length > 0} />
          </div>
          <Button onClick={() => void extraer()} disabled={extrayendo || enviando}>
            <PlayIcon /> {extrayendo ? "Extrayendo…" : "Extraer datos"}
          </Button>
        </div>
        <p className="mt-3 text-sm text-muted-foreground">
          Volumen previsto:{" "}
          {dias && dias > 0 && ciudadesSel.length > 0 ? (
            <strong className="text-foreground">
              {ciudadesSel.length} ciudad(es) × {dias} día(s) × 24 h = {fmtEntero(ciudadesSel.length * dias * 24)} registros horarios
            </strong>
          ) : (
            "—"
          )}{" "}
          · {ciudadesSel.length} petición(es) · máximo {MAX_DIAS} días por extracción · fechas en UTC.
        </p>
        {errores.length > 0 && (
          <ul role="alert" className="mt-2 list-inside text-sm text-red-700 dark:text-red-300">
            {errores.map((e) => <li key={e}>✖ {e}</li>)}
          </ul>
        )}
      </section>

      {/* 2. PIPELINE */}
      <section aria-labelledby="t-pipeline" className="flex flex-col gap-3">
        <h2 id="t-pipeline" className="text-base font-semibold">2. Pipeline</h2>
        {extrayendo && (
          <p role="status" className="text-sm">
            Descargando <strong>{enCursoCiudad?.ciudad}</strong>
            {" · "}procesadas: {extracciones.filter((e) => e.estado === "completada" || e.estado === "error").map((e) => e.ciudad).join(", ") || "ninguna"}
            {" · "}pendientes: {pendientesCiudad.map((e) => e.ciudad).join(", ") || "ninguna"}
          </p>
        )}
        <Pipeline fases={fases} onInspeccionar={setPestana} />
        {extracciones.filter((e) => e.estado === "error").map((e) => (
          <div key={e.ciudad} role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            <span>✖ Error al descargar <strong>{e.ciudad}</strong>: {e.error}</span>
            <Button size="sm" variant="outline" disabled={extrayendo || enviando} onClick={() => void reintentar(e.ciudad)}>
              <RotateCwIcon /> Reintentar solo {e.ciudad}
            </Button>
          </div>
        ))}
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Contador etiqueta="Total extraído" valor={procesado?.transformados.length ?? 0} ayuda="Registros horarios construidos" />
          <Contador etiqueta="Válidos" valor={procesado?.validos.length ?? 0} ayuda="Superan la limpieza" />
          <Contador etiqueta="Rechazados" valor={procesado?.rechazados.length ?? 0} ayuda="Descartes por calidad" />
          <Contador etiqueta="Coinciden con los filtros" valor={filtrado.ordenados.length} ayuda="Válidos tras filtrar" />
          <Contador etiqueta="Seleccionados para cargar" valor={filtrado.aSubir.length} ayuda="Seleccionados y dentro de filtros" destacado />
        </dl>
      </section>

      {/* 3. INSPECCIÓN */}
      <section aria-labelledby="t-datos" className="flex flex-col gap-3">
        <h2 id="t-datos" className="text-base font-semibold">3. Inspección de datos</h2>
        <Tabs value={pestana} onValueChange={(v) => setPestana(String(v))}>
          <div className="overflow-x-auto">
            <TabsList>
              <TabsTrigger value="json">JSON original</TabsTrigger>
              <TabsTrigger value="transformados">Transformados</TabsTrigger>
              <TabsTrigger value="validos">Válidos, filtros y selección</TabsTrigger>
              <TabsTrigger value="rechazados">Rechazados</TabsTrigger>
              <TabsTrigger value="carga">Vista previa de la carga</TabsTrigger>
              <TabsTrigger value="supabase">Datos en Supabase</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="json" className="flex flex-col gap-2 pt-2">
            {extracciones.length === 0 ? (
              <Vacio texto="Aún no hay extracciones. Configura el periodo y pulsa «Extraer datos»." />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  {extracciones.map((e) => (
                    <Button key={e.ciudad} size="sm" variant={e.ciudad === jsonVisible ? "default" : "outline"} onClick={() => setJsonVisible(e.ciudad)}>
                      {e.ciudad}
                    </Button>
                  ))}
                  <span className="mx-1 h-5 w-px bg-border" aria-hidden />
                  <Button size="sm" variant="outline" disabled={!extraccionJson?.json} onClick={() => extraccionJson && descargar(`open-meteo_${extraccionJson.ciudad}_${periodo?.inicio}_${periodo?.fin}.json`, extraccionJson.json)}>
                    <DownloadIcon /> Descargar {jsonVisible}
                  </Button>
                  <Button size="sm" variant="outline" disabled={!extracciones.some((e) => e.json)} onClick={() => descargar(`open-meteo_${periodo?.inicio}_${periodo?.fin}.json`, Object.fromEntries(extracciones.filter((e) => e.json).map((e) => [e.ciudad, e.json])))}>
                    <DownloadIcon /> Descargar todos
                  </Button>
                </div>
                {extraccionJson && (
                  <>
                    <p className="text-xs break-all text-muted-foreground">
                      GET <code>{extraccionJson.url}</code> · {fmtDuracion(extraccionJson.duracionMs)}
                    </p>
                    {extraccionJson.json ? (
                      <pre className="max-h-[28rem] overflow-auto rounded-md border bg-muted/40 p-3 text-xs">{JSON.stringify(extraccionJson.json, null, 2)}</pre>
                    ) : (
                      <Vacio texto={extraccionJson.error ? `Sin datos: ${extraccionJson.error}` : "Descarga pendiente."} />
                    )}
                  </>
                )}
              </>
            )}
          </TabsContent>

          <TabsContent value="transformados" className="flex flex-col gap-2 pt-2">
            <Explicacion>
              Un registro por ciudad y hora. Los valores aparecen <strong>sin corregir</strong>: un <Nulo texto="null" /> sigue siendo null (no 0) hasta que la limpieza decida.
            </Explicacion>
            {procesado?.avisos.map((a) => <p key={a} role="alert" className="text-sm text-red-700 dark:text-red-300">✖ {a}</p>)}
            <TablaPaginada columnas={columnasTransformadas} filas={procesado?.transformados ?? []} claveFila={(r) => r.id} vacio="Sin datos transformados." />
          </TabsContent>

          <TabsContent value="validos" className="flex flex-col gap-3 pt-2">
            <Explicacion>
              Orden de operaciones: <strong>válidos → filtros → ordenación → selección → carga</strong>. La paginación solo afecta a lo que ves. Cambiar los filtros nunca selecciona filas nuevas automáticamente.
            </Explicacion>
            <PanelFiltros
              filtros={filtros}
              onFiltros={setFiltros}
              orden={orden}
              onOrden={setOrden}
              ciudadesDisponibles={ciudadesDisponibles}
              avisos={procesado ? avisosFiltros(filtros) : []}
              onRestablecer={() => {
                setFiltros(filtrosIniciales(ciudadesDisponibles))
                setOrden(ORDEN_INICIAL)
              }}
            />
            <TablaSeleccion ordenados={filtrado.ordenados} seleccion={seleccion} onSeleccion={setSeleccion} fueraDeFiltros={filtrado.fuera} bloqueada={enviando} />
          </TabsContent>

          <TabsContent value="rechazados" className="flex flex-col gap-2 pt-2">
            <Explicacion>
              Descartes por <strong>calidad</strong>. Duplicados: se conserva la primera aparición válida (orden de ciudades y de los arrays). No se aplican umbrales a la temperatura. Los registros excluidos por filtros <strong>no</strong> aparecen aquí.
            </Explicacion>
            <TablaPaginada columnas={columnasRechazos} filas={procesado?.rechazados ?? []} claveFila={(r) => r.registro.id} vacio="No hay registros rechazados." />
          </TabsContent>

          <TabsContent value="carga" className="flex flex-col gap-3 pt-2">
            <Explicacion>
              Este es el conjunto exacto que se enviará, en el orden elegido y en lotes de {TAM_LOTE}. Ojo: una base de datos <strong>no conserva el orden de inserción</strong>; para leer los datos ordenados hay que usar <code>ORDER BY</code> en cada consulta.
            </Explicacion>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={() => void subir()} disabled={enviando || extrayendo || filtrado.aSubir.length === 0}>
                <CloudUploadIcon /> {enviando ? "Subiendo…" : `Subir ${fmtEntero(filtrado.aSubir.length)} registros a Supabase`}
              </Button>
              {filtrado.fuera > 0 && <span className="text-xs text-amber-700 dark:text-amber-300">⚠ {fmtEntero(filtrado.fuera)} seleccionadas fuera de filtros no se incluyen.</span>}
            </div>
            {carga && (
              <>
                <InformeCarga carga={carga} onReintentar={() => void reintentarLotes()} />
                <h3 className="text-sm font-semibold">Copia congelada enviada en la última carga</h3>
                <TablaPaginada
                  columnas={columnasCarga}
                  filas={carga.congelado.map((m, i) => ({ ...m, posicion: i + 1 }))}
                  claveFila={claveMedicion}
                />
              </>
            )}
            <h3 className="text-sm font-semibold">
              Registros locales pendientes de subir{carga && " (conjunto actual, si vuelves a pulsar «Subir»)"}
            </h3>
            <TablaPaginada
              columnas={columnasCarga}
              filas={filtrado.aSubir.map((m, i) => ({ ...m, posicion: i + 1 }))}
              claveFila={claveMedicion}
              vacio="No hay filas seleccionadas que cumplan los filtros."
            />
          </TabsContent>

          <TabsContent value="supabase" className="pt-2">
            <DatosSupabase version={versionDestino} />
          </TabsContent>
        </Tabs>
      </section>
    </main>
  )
}

function InformeCarga({ carga, onReintentar }: { carga: EstadoCarga; onReintentar: () => void }) {
  const r = resumenLotes(carga.estados)
  const v = carga.verificacion
  return (
    <section aria-label="Estado de la carga" className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <p>
        Copia congelada: <strong>{fmtEntero(carga.congelado.length)}</strong> registros en {carga.lotes.length} lote(s). Los cambios de filtros no la modifican.
      </p>
      <ol className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
        {carga.estados.map((e) => (
          <li key={e.indice} className="flex flex-wrap items-center justify-between gap-2 rounded border px-2 py-1 text-xs">
            <span>
              Lote {e.indice + 1}: filas {fmtEntero(e.desde + 1)}–{fmtEntero(e.desde + e.cantidad)}
              {e.intentos > 1 && ` · intento ${e.intentos}`}
              {e.duracionMs !== undefined && ` · ${fmtDuracion(e.duracionMs)}`}
            </span>
            <EstadoBadge estado={e.estado === "ok" ? "completada" : e.estado === "enviando" ? "en_curso" : e.estado} />
            {e.error && <span className="basis-full text-red-700 dark:text-red-300">✖ {e.error}</span>}
          </li>
        ))}
      </ol>
      {!carga.enCurso && (
        <div role="status" className="flex flex-col gap-1">
          <p>
            <strong>Informe:</strong> {fmtEntero(r.correctos)} registros procesados correctamente · {fmtEntero(r.fallidos)} fallidos
            {carga.duracionMs !== undefined && ` · ${fmtDuracion(carga.duracionMs)}`}.
          </p>
          <p className="flex items-start gap-1 text-xs text-muted-foreground">
            <InfoIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            El upsert de Supabase no indica cuántas filas eran nuevas y cuántas se actualizaron, así que no se muestran esos recuentos.
          </p>
          {r.fallidos > 0 && (
            <Button size="sm" variant="outline" className="self-start" onClick={onReintentar}>
              <RotateCwIcon /> Reintentar {r.lotesFallidos.length} lote(s) fallido(s)
            </Button>
          )}
        </div>
      )}
      {v && (
        <p role="status" className={cn("text-sm", v.estado === "error" && "text-red-700 dark:text-red-300")}>
          <strong>Verificación en destino:</strong>{" "}
          {v.estado === "en_curso" && "comprobando claves en Supabase…"}
          {v.estado === "error" && `✖ no se pudo verificar: ${v.error}`}
          {v.estado === "completada" &&
            (v.faltan.length === 0
              ? `✔ las ${fmtEntero(v.comprobadas)} claves enviadas en lotes correctos existen en la tabla.`
              : `✖ faltan ${fmtEntero(v.faltan.length)} de ${fmtEntero(v.comprobadas)} claves (p. ej. ${v.faltan[0].ciudad} ${fmtFechaUTC(v.faltan[0].fecha_hora)}).`)}
        </p>
      )}
    </section>
  )
}

function Explicacion({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-muted/50 px-3 py-2 text-xs leading-relaxed text-muted-foreground">{children}</p>
}

function Vacio({ texto }: { texto: string }) {
  return <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">{texto}</p>
}
