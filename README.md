# Pipeline ETL: Open-Meteo → Supabase

Práctica de Big Data. Aplicación Next.js que **extrae** datos horarios históricos de Open-Meteo, los **transforma**, **limpia**, permite **filtrar, ordenar y seleccionar** y los **carga** en Supabase. Cada fase muestra su estado, sus registros de entrada y salida y su duración real.

Stack: Next.js 16 (App Router), TypeScript, Tailwind 4, shadcn/ui (Base UI) y `@supabase/supabase-js`.

## Instalación y configuración

```bash
npm install
cp .env.example .env.local   # y rellena los valores
```

| Variable | Dónde se usa | Notas |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` (o `SUPABASE_URL`) | Servidor | URL del proyecto. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Solo servidor** | Clave secreta (`sb_secret_…` o `service_role`). Nunca le pongas el prefijo `NEXT_PUBLIC_`. |

Crea la tabla ejecutando la migración [`supabase/migrations/20261026120000_mediciones_meteorologicas.sql`](supabase/migrations/20261026120000_mediciones_meteorologicas.sql) en el **SQL Editor** de Supabase (o con `supabase db push` si usas la CLI).

## Ejecución

```bash
npm run dev        # http://localhost:3000
npm test           # pruebas (incluye una llamada real a Open-Meteo)
npm run typecheck
npm run build
```

## El pipeline

1. **Extracción.** Una petición GET por ciudad a `https://archive-api.open-meteo.com/v1/archive` con `hourly=temperature_2m,relative_humidity_2m,precipitation`, `timezone=UTC`, `temperature_unit=celsius` y `precipitation_unit=mm`. Máximo 31 días por extracción. El JSON original se guarda durante la sesión y se puede descargar. Si una ciudad falla se puede reintentar solo esa; el reintento **reemplaza** su JSON, así que nunca duplica filas.
2. **Transformación.** Los arrays paralelos (`time[i]`, `temperature_2m[i]`…) se convierten en un registro por ciudad y hora: `ciudad, fecha_hora, temperatura_c, humedad_pct, precipitacion_mm`. Las horas `"2026-09-01T05:00"` se interpretan explícitamente como UTC (`…T05:00:00Z`). Los valores **no se corrigen**: un `null` sigue siendo `null`. Si los arrays de una ciudad no tienen la misma longitud, se rechazan todas sus filas, porque no se puede saber qué valor corresponde a cada hora.
3. **Limpieza.** Se rechaza, con su motivo, toda fila sin ciudad, con fecha no válida o a la que le falte alguna medición (`null`, `""`, ausente, no numérica o no finita). También las que tengan la humedad fuera de 0–100 o la precipitación negativa. **No** se filtran temperaturas extremas. Duplicados por `(ciudad, fecha_hora)`: se conserva la **primera aparición válida** (en el orden de las ciudades y de los arrays) y se rechazan las demás.
4. **Filtrado y selección.** Orden fijo: válidos → filtros → ordenación → selección → carga. La paginación solo afecta a la vista. Solo se suben las filas seleccionadas que siguen cumpliendo los filtros; las que quedan fuera se cuentan aparte. Los filtros nunca seleccionan filas automáticamente. Las exclusiones por filtro no son rechazos de calidad.
5. **Carga.** Al pulsar «Subir N registros», se congela una copia del conjunto y de su orden. Se envía en lotes de hasta 500 registros a `/api/carga`, que vuelve a validar en el servidor y hace un `upsert` con `onConflict: ciudad,fecha_hora`. Cada lote tiene su propio estado. Si alguno falla, los anteriores se conservan y se pueden reintentar solo los fallidos. El upsert no distingue entre filas insertadas y actualizadas, por eso solo se informa de las *procesadas*. Al terminar, `/api/verificacion` comprueba por lotes que las claves enviadas existen en la tabla.

> Una base de datos no conserva el orden de inserción. Para leer los datos ordenados, cada consulta necesita `ORDER BY` (la pestaña «Datos en Supabase» lo hace).

## Seguridad

- Todas las lecturas y escrituras en Supabase se hacen en rutas de servidor (`app/api/*`) con `lib/supabase-servidor.ts`, que importa `server-only`. La clave secreta no llega al navegador; se ha comprobado que no aparece en `.next/static`.
- RLS está activado y la tabla **no tiene políticas**: `anon` y `authenticated` no pueden leer ni escribir.
- El servidor valida el tamaño de la petición (413), el número de registros por lote (500) y cada registro (422, sin escribir nada del lote).
- **La aplicación no tiene autenticación.** Los endpoints `/api/carga`, `/api/verificacion` y `/api/mediciones` quedan abiertos y solo sirven para **desarrollo local**. Antes de publicarla hay que protegerlos (por ejemplo, con Supabase Auth y una comprobación de sesión en cada ruta).
