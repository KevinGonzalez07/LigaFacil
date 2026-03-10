# LigaFácil

Aplicación web estática para gestionar ligas de fútbol con:

- Login simple por usuario (registro automático local en navegador).
- Múltiples ligas por usuario (persistencia en `localStorage`).
- Registro de equipos.
- Tabla general con: puntos, diferencia de goles, goles a favor, goles en contra, ganados, empatados y perdidos.
- Generación de jornadas en sábados consecutivos.
- Asignación de campos y horarios disponibles de jornada.
- Configuración de duración del partido (en minutos) para construir los horarios.
- Permisos/ausencias por jornada para marcar partidos aplazados.
- Impresión de tabla y descarga como imagen con título de liga.
- Estilo visual moderno (tarjetas, gradientes y layout responsivo).

## Ejecutar localmente

```bash
python3 -m http.server 4173
```

Luego abre `http://localhost:4173`.
