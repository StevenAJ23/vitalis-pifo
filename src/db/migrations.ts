import type { Db } from './types';

/**
 * Migraciones versionadas (PRAGMA user_version). Cada migración se aplica en su propia transacción.
 * Reglas: nunca editar una migración publicada; agregar una nueva con versión mayor.
 * Todas las entidades usan UUID como clave primaria para la consolidación futura con PostgreSQL vía API REST.
 */
export interface Migracion {
  version: number;
  descripcion: string;
  sql: string[];
}

export const MIGRACIONES: Migracion[] = [
  {
    version: 1,
    descripcion: 'Esquema inicial del piloto',
    sql: [
      `CREATE TABLE usuarios (
        id TEXT PRIMARY KEY,
        usuario TEXT NOT NULL UNIQUE COLLATE NOCASE,
        nombre TEXT NOT NULL,
        rol TEXT NOT NULL CHECK (rol IN ('ADMIN','MEDICO','OPERADOR','ANALISTA')),
        credencial_protegida TEXT,
        codigo_operador TEXT NOT NULL,
        activo INTEGER NOT NULL DEFAULT 1,
        intentos_fallidos INTEGER NOT NULL DEFAULT 0,
        bloqueado_hasta INTEGER,
        debe_cambiar_clave INTEGER NOT NULL DEFAULT 0,
        creado_at INTEGER NOT NULL,
        actualizado_at INTEGER NOT NULL
      )`,
      `CREATE TABLE campanas (
        id TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        sector TEXT NOT NULL,
        inicio TEXT NOT NULL,
        fin TEXT,
        descripcion TEXT,
        responsable TEXT NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('PLANIFICADA','ACTIVA','CERRADA','ARCHIVADA')),
        creado_por TEXT REFERENCES usuarios(id),
        creado_at INTEGER NOT NULL,
        actualizado_at INTEGER NOT NULL,
        sync_estado TEXT NOT NULL DEFAULT 'PENDIENTE'
      )`,
      `CREATE TABLE pacientes (
        id TEXT PRIMARY KEY,
        codigo TEXT NOT NULL UNIQUE,
        nombres TEXT NOT NULL,
        apellidos TEXT NOT NULL,
        nombre_norm TEXT NOT NULL,
        edad INTEGER CHECK (edad IS NULL OR (edad >= 0 AND edad <= 120)),
        sector TEXT NOT NULL,
        telefono TEXT,
        campos_opcionales TEXT NOT NULL DEFAULT '{}',
        canal_preferido TEXT NOT NULL DEFAULT 'NINGUNO' CHECK (canal_preferido IN ('WHATSAPP','SMS','NINGUNO')),
        creado_por TEXT REFERENCES usuarios(id),
        creado_at INTEGER NOT NULL,
        actualizado_at INTEGER NOT NULL,
        anulado_at INTEGER,
        anulado_por TEXT,
        motivo_anulacion TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        sync_estado TEXT NOT NULL DEFAULT 'PENDIENTE'
      )`,
      `CREATE INDEX idx_pacientes_nombre ON pacientes(nombre_norm)`,
      `CREATE INDEX idx_pacientes_sector ON pacientes(sector)`,
      `CREATE TABLE consentimientos (
        id TEXT PRIMARY KEY,
        paciente_id TEXT NOT NULL REFERENCES pacientes(id),
        finalidad TEXT NOT NULL,
        canal TEXT NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('OTORGADO','REVOCADO')),
        fecha INTEGER NOT NULL,
        version_aviso TEXT NOT NULL,
        usuario_id TEXT REFERENCES usuarios(id),
        sync_estado TEXT NOT NULL DEFAULT 'PENDIENTE'
      )`,
      `CREATE INDEX idx_consent_paciente ON consentimientos(paciente_id, fecha)`,
      `CREATE TABLE atenciones (
        id TEXT PRIMARY KEY,
        paciente_id TEXT NOT NULL REFERENCES pacientes(id),
        campana_id TEXT NOT NULL REFERENCES campanas(id),
        usuario_id TEXT NOT NULL REFERENCES usuarios(id),
        fecha INTEGER NOT NULL,
        sistolica INTEGER, diastolica INTEGER, frecuencia INTEGER,
        temperatura REAL, spo2 INTEGER, peso REAL, talla_cm REAL, imc REAL,
        oido_i TEXT NOT NULL DEFAULT 'NO_EVALUADO' CHECK (oido_i IN ('SI','NO','NO_EVALUADO')),
        oido_d TEXT NOT NULL DEFAULT 'NO_EVALUADO' CHECK (oido_d IN ('SI','NO','NO_EVALUADO')),
        observaciones TEXT,
        seguimiento INTEGER NOT NULL DEFAULT 0,
        cita_at TEXT,
        requiere_revision INTEGER NOT NULL DEFAULT 0,
        revisado_por TEXT REFERENCES usuarios(id),
        revisado_at INTEGER,
        version INTEGER NOT NULL DEFAULT 1,
        anulado_at INTEGER,
        anulado_por TEXT,
        motivo_anulacion TEXT,
        creado_at INTEGER NOT NULL,
        actualizado_at INTEGER NOT NULL,
        sync_estado TEXT NOT NULL DEFAULT 'PENDIENTE'
      )`,
      `CREATE INDEX idx_atenciones_paciente ON atenciones(paciente_id, fecha)`,
      `CREATE INDEX idx_atenciones_campana ON atenciones(campana_id, fecha)`,
      `CREATE TABLE atenciones_versiones (
        id TEXT PRIMARY KEY,
        atencion_id TEXT NOT NULL REFERENCES atenciones(id),
        version INTEGER NOT NULL,
        datos TEXT NOT NULL,
        usuario_id TEXT REFERENCES usuarios(id),
        fecha INTEGER NOT NULL,
        motivo TEXT NOT NULL,
        UNIQUE(atencion_id, version)
      )`,
      `CREATE TABLE auditoria (
        id TEXT PRIMARY KEY,
        usuario_id TEXT,
        entidad TEXT NOT NULL,
        entidad_id TEXT,
        accion TEXT NOT NULL,
        fecha INTEGER NOT NULL,
        detalle TEXT
      )`,
      `CREATE INDEX idx_auditoria_fecha ON auditoria(fecha)`,
      `CREATE TABLE evaluacion (
        id TEXT PRIMARY KEY,
        codigo TEXT NOT NULL UNIQUE,
        atencion_id TEXT REFERENCES atenciones(id),
        campana_id TEXT NOT NULL REFERENCES campanas(id),
        metodo TEXT NOT NULL CHECK (metodo IN ('DIGITAL','PAPEL','EXCEL')),
        operador TEXT NOT NULL,
        inicio INTEGER NOT NULL,
        fin INTEGER NOT NULL,
        duracion_s REAL NOT NULL,
        tiempo_busqueda_s REAL,
        errores_validacion INTEGER NOT NULL DEFAULT 0,
        errores_verificados INTEGER,
        incompletos INTEGER NOT NULL DEFAULT 0,
        correcciones INTEGER NOT NULL DEFAULT 0,
        conectividad TEXT NOT NULL DEFAULT 'DESCONOCIDA' CHECK (conectividad IN ('EN_LINEA','SIN_CONEXION','DESCONOCIDA')),
        guardado_exitoso INTEGER NOT NULL DEFAULT 1,
        creado_at INTEGER NOT NULL
      )`,
      `CREATE INDEX idx_evaluacion_campana ON evaluacion(campana_id, metodo)`,
      `CREATE TABLE evaluacion_sesion (
        id TEXT PRIMARY KEY,
        campana_id TEXT NOT NULL REFERENCES campanas(id),
        operador TEXT NOT NULL,
        metodo TEXT NOT NULL CHECK (metodo IN ('DIGITAL','PAPEL','EXCEL')),
        satisfaccion INTEGER NOT NULL CHECK (satisfaccion BETWEEN 1 AND 5),
        tiempo_consolidacion_s REAL,
        hojas_papel INTEGER,
        notas TEXT,
        fecha INTEGER NOT NULL
      )`,
      `CREATE TABLE rutas (
        id TEXT PRIMARY KEY,
        campana_id TEXT NOT NULL REFERENCES campanas(id),
        usuario_id TEXT NOT NULL REFERENCES usuarios(id),
        dispositivo_id TEXT,
        estado TEXT NOT NULL CHECK (estado IN ('EN_CURSO','PAUSADA','INTERRUMPIDA','FINALIZADA')),
        inicio_ms INTEGER NOT NULL,
        fin_ms INTEGER,
        activo_ms INTEGER DEFAULT 0,
        distancia_m REAL DEFAULT 0,
        segmento_actual INTEGER NOT NULL DEFAULT 0,
        tramo_inicio_ms INTEGER,
        saltos_consecutivos INTEGER NOT NULL DEFAULT 0,
        modo_traslado TEXT NOT NULL DEFAULT 'A_PIE',
        origen TEXT NOT NULL DEFAULT 'CAPTURA' CHECK (origen IN ('CAPTURA','SINTETICO')),
        ultimo_punto_ms INTEGER
      )`,
      `CREATE INDEX idx_rutas_campana ON rutas(campana_id, inicio_ms)`,
      `CREATE TABLE ruta_puntos (
        id TEXT PRIMARY KEY,
        ruta_id TEXT NOT NULL REFERENCES rutas(id),
        segmento INTEGER NOT NULL,
        fecha_ms INTEGER NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        precision_m REAL,
        UNIQUE(ruta_id, segmento, fecha_ms)
      )`,
      `CREATE INDEX idx_ruta_puntos ON ruta_puntos(ruta_id, fecha_ms)`,
      `CREATE TABLE ruta_paradas (
        id TEXT PRIMARY KEY,
        ruta_id TEXT REFERENCES rutas(id),
        fecha_ms INTEGER,
        etiqueta TEXT,
        lat REAL,
        lon REAL
      )`,
      `CREATE TABLE ruta_eventos (
        id TEXT PRIMARY KEY,
        ruta_id TEXT NOT NULL REFERENCES rutas(id),
        tipo TEXT NOT NULL,
        fecha_ms INTEGER NOT NULL,
        detalle TEXT
      )`,
      `CREATE INDEX idx_ruta_eventos ON ruta_eventos(ruta_id, fecha_ms)`,
      `CREATE TABLE ajustes (
        clave TEXT PRIMARY KEY,
        valor TEXT NOT NULL
      )`,
      `CREATE TABLE secuencias (
        nombre TEXT PRIMARY KEY,
        valor INTEGER NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    descripcion: 'Inicio de sesión biométrico (hash del token protegido por huella/rostro)',
    sql: ['ALTER TABLE usuarios ADD COLUMN biometria_hash TEXT'],
  },
];

export const VERSION_ESQUEMA = MIGRACIONES[MIGRACIONES.length - 1].version;

export async function versionActual(db: Db): Promise<number> {
  const r = await db.get<{ user_version: number }>('PRAGMA user_version');
  return r?.user_version ?? 0;
}

export async function migrar(db: Db, migraciones: Migracion[] = MIGRACIONES): Promise<number> {
  const actual = await versionActual(db);
  if (actual > (migraciones[migraciones.length - 1]?.version ?? 0)) {
    throw new Error(`La base de datos (v${actual}) es más reciente que la aplicación. Actualice la app.`);
  }
  for (const m of migraciones) {
    if (m.version <= actual) continue;
    await db.transaction(async (tx) => {
      for (const sentencia of m.sql) await tx.exec(sentencia);
      // user_version no admite parámetros; el valor proviene de una constante entera del código.
      await tx.exec(`PRAGMA user_version = ${Math.trunc(m.version)}`);
    });
  }
  return versionActual(db);
}

/** Tablas con datos de negocio, en orden seguro para borrado (hijos primero). */
export const TABLAS_DATOS = [
  'ruta_eventos',
  'ruta_paradas',
  'ruta_puntos',
  'rutas',
  'evaluacion_sesion',
  'evaluacion',
  'atenciones_versiones',
  'atenciones',
  'consentimientos',
  'pacientes',
  'campanas',
  'auditoria',
] as const;
