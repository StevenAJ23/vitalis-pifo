# Contrato propuesto · consolidación con API REST + PostgreSQL

El piloto funciona **sin servidor**. Este documento fija el contrato que implementa `src/sync/syncService.ts` para una fase posterior.

## Principios

- Cada dispositivo es autónomo; las entidades usan **UUID v4** generados en el dispositivo, por lo que la consolidación no requiere renumerar.
- Tablas sincronizables: `campanas`, `pacientes`, `consentimientos`, `atenciones` (columna `sync_estado` = `PENDIENTE` | `SINCRONIZADO`). Toda modificación vuelve la fila a `PENDIENTE`.
- Las rutas GPS **no** se sincronizan por defecto (información sensible; se comparten como GeoJSON generalizado bajo revisión).
- Nunca hay envío automático: requiere URL **HTTPS**, token y acción explícita de un administrador (`respaldo.gestionar`).

## Endpoint

`POST {base}/v1/sync/lotes` · `Authorization: Bearer <token>` · `Content-Type: application/json`

```json
{
  "dispositivo_id": "uuid",
  "generado": 1794787200000,
  "esquema": 1,
  "entidades": {
    "campanas": [{ "id": "uuid", "nombre": "...", "estado": "ACTIVA", "actualizado_at": 0, "...": "..." }],
    "pacientes": [],
    "consentimientos": [],
    "atenciones": [{ "id": "uuid", "version": 2, "...": "..." }]
  }
}
```

Respuesta `200`:

```json
{ "aceptados": { "pacientes": ["uuid", "..."], "atenciones": ["uuid"] } }
```

Solo los UUID devueltos se marcan `SINCRONIZADO`. Conflictos: el servidor conserva la fila con mayor `version` (atenciones) o `actualizado_at` (resto) y guarda el historial; un registro rechazado sigue `PENDIENTE`.

## Esquema PostgreSQL sugerido

Mismo modelo relacional que SQLite (ver `src/db/migrations.ts`) con: `id uuid primary key`, `dispositivo_id uuid`, marcas `timestamptz`, `campos_opcionales jsonb`, cifrado en reposo del servidor, RLS por rol y auditoría centralizada.
