"use client"

import {
  ArrowDownIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  Loader2Icon,
  TriangleAlertIcon,
} from "lucide-react"

import { fmtDuracion, fmtEntero } from "@/lib/etl/formato"
import type { EstadoFase } from "@/lib/etl/tipos"
import { cn } from "@/lib/utils"

const ESTADOS: Record<EstadoFase, { texto: string; icono: React.ElementType; clase: string }> = {
  pendiente: { texto: "Pendiente", icono: CircleDashedIcon, clase: "text-muted-foreground border-border" },
  en_curso: { texto: "En curso", icono: Loader2Icon, clase: "text-sky-700 border-sky-300 dark:text-sky-300 dark:border-sky-800" },
  completada: { texto: "Completada", icono: CheckCircle2Icon, clase: "text-emerald-700 border-emerald-300 dark:text-emerald-300 dark:border-emerald-800" },
  error: { texto: "Con errores", icono: TriangleAlertIcon, clase: "text-red-700 border-red-300 dark:text-red-300 dark:border-red-800" },
}

/** Estado con icono y texto: no depende solo del color. */
export function EstadoBadge({ estado, className }: { estado: EstadoFase; className?: string }) {
  const { texto, icono: Icono, clase } = ESTADOS[estado]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        clase,
        className
      )}
    >
      <Icono aria-hidden className={cn("size-3.5", estado === "en_curso" && "animate-spin")} />
      {texto}
    </span>
  )
}

export type Fase = {
  id: string
  numero: number
  titulo: string
  explicacion: string
  estado: EstadoFase
  entrada?: { valor: number; etiqueta: string }
  salida?: { valor: number; etiqueta: string }
  extra?: React.ReactNode
  duracionMs?: number
  /** Pestaña de inspección asociada. */
  pestana: string
}

export function Pipeline({
  fases,
  onInspeccionar,
}: {
  fases: Fase[]
  onInspeccionar: (pestana: string) => void
}) {
  return (
    <ol className="grid gap-2 lg:grid-cols-[repeat(5,minmax(0,1fr))]" aria-label="Fases del pipeline ETL">
      {fases.map((f, i) => (
        <li key={f.id} className="relative flex flex-col">
          <article
            className={cn(
              "flex h-full flex-col gap-2 rounded-lg border bg-card p-3 text-sm",
              f.estado === "error" && "border-red-300 dark:border-red-800",
              f.estado === "en_curso" && "border-sky-300 dark:border-sky-800"
            )}
          >
            <header className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">
                <span className="mr-1 text-muted-foreground">{f.numero}.</span>
                {f.titulo}
              </h3>
              <EstadoBadge estado={f.estado} />
            </header>
            <p className="text-xs leading-relaxed text-muted-foreground">{f.explicacion}</p>
            <dl className="mt-auto grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
              <dt className="text-muted-foreground">Entrada</dt>
              <dd className="text-right font-medium tabular-nums">
                {f.entrada ? `${fmtEntero(f.entrada.valor)} ${f.entrada.etiqueta}` : "—"}
              </dd>
              <dt className="text-muted-foreground">Salida</dt>
              <dd className="text-right font-medium tabular-nums">
                {f.salida ? `${fmtEntero(f.salida.valor)} ${f.salida.etiqueta}` : "—"}
              </dd>
              <dt className="text-muted-foreground">Duración</dt>
              <dd className="text-right tabular-nums">{fmtDuracion(f.duracionMs)}</dd>
            </dl>
            {f.extra}
            <button
              type="button"
              className="self-start text-xs font-medium text-primary underline-offset-4 hover:underline"
              onClick={() => onInspeccionar(f.pestana)}
            >
              Inspeccionar resultados
            </button>
          </article>
          {i < fases.length - 1 && (
            <>
              <ArrowRightIcon
                aria-hidden
                className="absolute top-1/2 -right-2.5 z-10 hidden size-4 -translate-y-1/2 rounded-full bg-background text-muted-foreground lg:block"
              />
              <ArrowDownIcon aria-hidden className="mx-auto my-0.5 size-4 text-muted-foreground lg:hidden" />
            </>
          )}
        </li>
      ))}
    </ol>
  )
}
