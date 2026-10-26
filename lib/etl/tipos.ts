export type Ciudad = {
  nombre: string
  latitud: number
  longitud: number
}

export type EstadoFase = "pendiente" | "en_curso" | "completada" | "error"

export type ExtraccionCiudad = {
  ciudad: string
  estado: EstadoFase
  url: string
  /** JSON original tal como lo devolvió Open-Meteo. */
  json?: unknown
  error?: string
  duracionMs?: number
  /** Número de instantes horarios recibidos (longitud de hourly.time). */
  horas?: number
}

/**
 * Registro construido a partir de los arrays paralelos. Las mediciones se
 * guardan tal como llegan (pueden ser null, cadenas, undefined…): la
 * transformación no corrige nada, solo reorganiza.
 */
export type RegistroTransformado = {
  /** Identificador estable de la fila: ciudad + índice en los arrays. */
  id: string
  ciudad: string | null
  indice: number
  fecha_hora_original: unknown
  /** ISO 8601 en UTC (sufijo Z) o null si la fecha no es válida. */
  fecha_hora: string | null
  temperatura_c: unknown
  humedad_pct: unknown
  precipitacion_mm: unknown
  /** true si los arrays de la ciudad no tienen la misma longitud. */
  arrays_incoherentes: boolean
}

/** Registro limpio, con el formato exacto de la tabla de destino. */
export type Medicion = {
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
}

export type Rechazo = {
  registro: RegistroTransformado
  motivos: string[]
}

export type CampoOrden =
  | "ciudad"
  | "fecha_hora"
  | "temperatura_c"
  | "humedad_pct"
  | "precipitacion_mm"

export type Orden = {
  campo: CampoOrden
  direccion: "asc" | "desc"
}
