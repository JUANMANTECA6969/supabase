// Fixtures controlados SOLO para pruebas. La aplicación nunca los importa.

const horas = (n: number) =>
  Array.from({ length: n }, (_, i) => `2026-09-01T${String(i).padStart(2, "0")}:00`)

export const respuestaCorrecta = {
  timezone: "GMT",
  hourly_units: { time: "iso8601", temperature_2m: "°C", relative_humidity_2m: "%", precipitation: "mm" },
  hourly: {
    time: horas(3),
    temperature_2m: [20.5, -3.2, 48.9],
    relative_humidity_2m: [60, 70, 80],
    precipitation: [0, 0.4, 0],
  },
}

export const respuestaConNulos = {
  hourly: {
    time: [...horas(5), "2026-09-01T25:00"],
    temperature_2m: [null, 18, 18, "", 18, 18],
    relative_humidity_2m: [50, null, 101, 50, 50, 50],
    precipitation: [0, 0, 0, 0, -0.1, 0],
  },
}

export const respuestaConDuplicados = {
  hourly: {
    time: ["2026-09-01T00:00", "2026-09-01T01:00", "2026-09-01T00:00"],
    temperature_2m: [10, 11, 99],
    relative_humidity_2m: [50, 50, 50],
    precipitation: [0, 0, 0],
  },
}

export const respuestaIncoherente = {
  hourly: {
    time: horas(3),
    temperature_2m: [1, 2],
    relative_humidity_2m: [50, 50, 50],
    precipitation: [0, 0, 0],
  },
}
