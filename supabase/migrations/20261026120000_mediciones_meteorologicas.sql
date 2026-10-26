-- Tabla de destino del pipeline ETL Open-Meteo → Supabase.
create table if not exists public.mediciones_meteorologicas (
  id bigint generated always as identity primary key,
  ciudad text not null check (length(btrim(ciudad)) > 0),
  fecha_hora timestamptz not null,
  temperatura_c double precision not null
    check (temperatura_c not in ('NaN'::float8, 'Infinity'::float8, '-Infinity'::float8)),
  humedad_pct double precision not null
    check (humedad_pct >= 0 and humedad_pct <= 100),
  precipitacion_mm double precision not null
    check (precipitacion_mm >= 0 and precipitacion_mm <> 'Infinity'::float8),
  importado_en timestamptz not null default now(),
  constraint mediciones_meteorologicas_ciudad_fecha_hora_key unique (ciudad, fecha_hora)
);

comment on table public.mediciones_meteorologicas is
  'Mediciones horarias (UTC) de Open-Meteo cargadas por el pipeline ETL de la práctica.';
comment on column public.mediciones_meteorologicas.importado_en is
  'Momento de la primera inserción; un upsert posterior no lo modifica.';

create index if not exists mediciones_meteorologicas_fecha_hora_idx
  on public.mediciones_meteorologicas (fecha_hora);

-- RLS activado y SIN políticas: anon y authenticated no pueden leer ni escribir.
-- El servidor de Next.js usa la clave secreta (service role), que omite RLS.
alter table public.mediciones_meteorologicas enable row level security;
revoke all on table public.mediciones_meteorologicas from anon, authenticated;
