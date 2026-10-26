"use client"

import { useState } from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { fmtEntero } from "@/lib/etl/formato"
import { cn } from "@/lib/utils"

export type Columna<T> = {
  id: string
  encabezado: React.ReactNode
  celda: (fila: T) => React.ReactNode
  className?: string
}

export const TAMANOS_PAGINA = [25, 50, 100]

export function Paginacion({
  pagina,
  total,
  tamano,
  onPagina,
  onTamano,
}: {
  pagina: number
  total: number
  tamano: number
  onPagina: (p: number) => void
  onTamano?: (t: number) => void
}) {
  const paginas = Math.max(1, Math.ceil(total / tamano))
  const desde = total === 0 ? 0 : pagina * tamano + 1
  const hasta = Math.min(total, (pagina + 1) * tamano)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span aria-live="polite">
        Filas {fmtEntero(desde)}–{fmtEntero(hasta)} de {fmtEntero(total)} · página{" "}
        {pagina + 1} de {paginas}
      </span>
      <div className="flex items-center gap-2">
        {onTamano && (
          <label className="flex items-center gap-1">
            Filas por página
            <select
              className="h-7 rounded-md border bg-background px-1 text-foreground"
              value={tamano}
              onChange={(e) => onTamano(Number(e.target.value))}
            >
              {TAMANOS_PAGINA.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página anterior"
          disabled={pagina === 0}
          onClick={() => onPagina(pagina - 1)}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página siguiente"
          disabled={pagina >= paginas - 1}
          onClick={() => onPagina(pagina + 1)}
        >
          <ChevronRightIcon />
        </Button>
      </div>
    </div>
  )
}

/** Tabla sin paginar: recibe solo las filas de la página visible. */
export function Tabla<T>({
  columnas,
  filas,
  claveFila,
  vacio = "No hay filas que mostrar.",
  claseFila,
}: {
  columnas: Columna<T>[]
  filas: T[]
  claveFila: (fila: T) => string
  vacio?: string
  claseFila?: (fila: T) => string | undefined
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columnas.map((c) => (
              <TableHead key={c.id} className={c.className}>
                {c.encabezado}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columnas.length} className="py-8 text-center text-muted-foreground">
                {vacio}
              </TableCell>
            </TableRow>
          ) : (
            filas.map((f) => (
              <TableRow key={claveFila(f)} className={claseFila?.(f)}>
                {columnas.map((c) => (
                  <TableCell key={c.id} className={cn("tabular-nums", c.className)}>
                    {c.celda(f)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

/** Tabla con paginación local (solo de visualización). */
export function TablaPaginada<T>(props: {
  columnas: Columna<T>[]
  filas: T[]
  claveFila: (fila: T) => string
  vacio?: string
}) {
  const [pagina, setPagina] = useState(0)
  const [tamano, setTamano] = useState(TAMANOS_PAGINA[0])
  const paginas = Math.max(1, Math.ceil(props.filas.length / tamano))
  const actual = Math.min(pagina, paginas - 1)
  return (
    <div className="flex flex-col gap-2">
      <Tabla {...props} filas={props.filas.slice(actual * tamano, (actual + 1) * tamano)} />
      <Paginacion
        pagina={actual}
        total={props.filas.length}
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
