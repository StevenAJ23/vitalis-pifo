import { ATENCION_FORM_VACIO } from '../src/schemas/atencion';
import { PACIENTE_FORM_VACIO } from '../src/schemas/paciente';
import * as auth from '../src/services/authService';
import * as atenciones from '../src/services/atencionService';
import * as backup from '../src/services/backupService';
import * as campanas from '../src/services/campanaService';
import * as pacientes from '../src/services/pacienteService';
import * as seguridad from '../src/services/seguridadService';
import * as exportar from '../src/services/exportService';
import * as rutas from '../src/services/rutaService';
import * as sintetico from '../src/services/sinteticoService';
import { protegerCredencial, verificarCredencial, validarPoliticaClave } from '../src/security/passwords';
import { cifrarRespaldo, descifrarRespaldo, parsearSobre } from '../src/security/backupCrypto';
import { aBase64, desdeBase64, desdeUtf8, utf8 } from '../src/security/encoding';
import { puede, AccesoDenegadoError } from '../src/security/permissions';
import { guardarAjuste } from '../src/repositories/ajustes';
import { conAdmin, crearDbPrueba } from './helpers/sqljsDb';
import type { Actor } from '../src/services/contexto';

jest.setTimeout(60_000);

describe('Credenciales', () => {
  it('PBKDF2 con sal: verifica y no guarda texto plano', async () => {
    const h = await protegerCredencial('Secreta123', 5000);
    expect(h).not.toContain('Secreta123');
    expect(h.startsWith('pbkdf2-sha256$5000$')).toBe(true);
    expect(await verificarCredencial('Secreta123', h)).toBe(true);
    expect(await verificarCredencial('secreta123', h)).toBe(false);
    expect(await protegerCredencial('Secreta123', 5000)).not.toBe(h); // sal distinta
    expect(validarPoliticaClave('corta1')).not.toBeNull();
    expect(validarPoliticaClave('soloLetras')).not.toBeNull();
  });

  it('login con mensaje genérico y bloqueo tras 5 intentos', async () => {
    const { db } = await crearDbPrueba();
    await conAdmin(db);
    const credGuardada = await db.get<{ c: string }>('SELECT credencial_protegida AS c FROM usuarios');
    expect(credGuardada?.c).not.toContain('Clave1234');
    await expect(auth.iniciarSesion(db, 'noexiste', 'x')).rejects.toThrow('Usuario o contraseña incorrectos.');
    for (let i = 0; i < 4; i++) await expect(auth.iniciarSesion(db, 'admin', 'mala')).rejects.toThrow('Usuario o contraseña incorrectos.');
    await expect(auth.iniciarSesion(db, 'admin', 'mala')).rejects.toThrow(/bloqueada/);
    await expect(auth.iniciarSesion(db, 'admin', 'Clave1234')).rejects.toThrow(/bloqueada/);
    const fallos = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM auditoria WHERE accion IN ('LOGIN_FALLIDO','LOGIN_BLOQUEADO')");
    expect(fallos?.n).toBe(6);
  });

  it('no permite desactivar al último administrador', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    await expect(auth.actualizarUsuario(db, admin, admin.id, { nombre: 'X', rol: 'MEDICO', activo: true })).rejects.toThrow(/al menos un administrador/);
  });
});

describe('Control de acceso por roles', () => {
  it('matriz de mínimo privilegio', () => {
    expect(puede('OPERADOR', 'atencion.crear')).toBe(true);
    expect(puede('OPERADOR', 'paciente.ver_ficha')).toBe(false);
    expect(puede('ANALISTA', 'paciente.buscar')).toBe(false);
    expect(puede('ANALISTA', 'exportar.metricas')).toBe(true);
    expect(puede('MEDICO', 'respaldo.gestionar')).toBe(false);
    expect(puede('ADMIN', 'respaldo.gestionar')).toBe(true);
  });

  it('los servicios aplican el control aunque la UI lo omita', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    const idOp = await auth.crearUsuario(db, admin, { nombre: 'Operador Uno', usuario: 'op1', rol: 'OPERADOR', clave: 'Operador123' });
    const idAn = await auth.crearUsuario(db, admin, { nombre: 'Analista', usuario: 'an1', rol: 'ANALISTA', clave: 'Analista123' });
    const op = auth.aActor((await auth.iniciarSesion(db, 'op1', 'Operador123')));
    const an = auth.aActor((await auth.iniciarSesion(db, 'an1', 'Analista123')));
    expect(op.id).toBe(idOp);
    const p = await pacientes.crear(db, op, { ...PACIENTE_FORM_VACIO, nombres: 'Ana', apellidos: 'Prueba', edad: '30', sector: 'Pifo' });
    await expect(pacientes.obtenerFicha(db, op, p.id)).rejects.toBeInstanceOf(AccesoDenegadoError);
    await expect(pacientes.buscar(db, an, 'Ana')).rejects.toBeInstanceOf(AccesoDenegadoError);
    await expect(backup.crearRespaldo(db, op, 'ClaveRespaldo2026')).rejects.toBeInstanceOf(AccesoDenegadoError);
    expect(an.id).toBe(idAn);
  });
});

describe('Codificación y respaldo cifrado', () => {
  it('base64 y UTF-8 ida y vuelta', () => {
    const s = 'Ñandú – señal 🛰️ ok';
    expect(desdeUtf8(utf8(s))).toBe(s);
    const b = new Uint8Array([0, 1, 2, 250, 255, 128, 7]);
    expect(Array.from(desdeBase64(aBase64(b)))).toEqual(Array.from(b));
    expect(aBase64(utf8('hola'))).toBe(Buffer.from('hola').toString('base64'));
  });

  it('AES-256-GCM: clave incorrecta y alteración se detectan', async () => {
    const sobre = await cifrarRespaldo('{"x":"dato clínico"}', 'FraseSegura2026', { creado: 1, dispositivo: 'd', esquema: 1 }, 20_000);
    expect(JSON.stringify(sobre)).not.toContain('dato clínico');
    expect(await descifrarRespaldo(sobre, 'FraseSegura2026')).toBe('{"x":"dato clínico"}');
    await expect(descifrarRespaldo(sobre, 'OtraFrase2026x')).rejects.toThrow(/contraseña incorrecta/);
    const alterado = parsearSobre(JSON.stringify({ ...sobre, dispositivo: 'otro' }));
    await expect(descifrarRespaldo(alterado, 'FraseSegura2026')).rejects.toThrow();
    expect(() => parsearSobre('no es json')).toThrow();
  });

  async function poblar() {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    const campId = await campanas.crear(db, admin, { nombre: 'Campaña', sector: 'Pifo', inicio: '2026-11-15', fin: '', descripcion: '', responsable: 'Resp', estado: 'ACTIVA' });
    const res = await sintetico.generar(db, admin, campId, 5);
    return { db, admin, campId, rutaId: res.rutaId! };
  }

  it('respaldo y restauración probada (reemplazar y fusionar)', async () => {
    const { db, admin } = await poblar();
    const { sobre, conteos } = await backup.crearRespaldo(db, admin, 'ClaveRespaldo2026');
    expect(conteos.pacientes).toBe(5);
    expect(conteos.ruta_puntos).toBeGreaterThan(100);
    const texto = JSON.stringify(sobre);
    expect(texto).not.toContain('Ficticio');
    expect(texto).not.toContain('pbkdf2-sha256'); // sin credenciales

    const v = await backup.verificarRespaldo(db, admin, texto, 'ClaveRespaldo2026');
    expect(v.conteos.atenciones).toBe(5);

    // Dispositivo nuevo: otro admin con el mismo nombre de usuario
    const destino = await crearDbPrueba();
    const admin2: Actor = await conAdmin(destino.db);
    await backup.restaurar(destino.db, admin2, texto, 'ClaveRespaldo2026', 'REEMPLAZAR');
    const n = await destino.db.get<{ p: number; a: number; r: number }>('SELECT (SELECT COUNT(*) FROM pacientes) p, (SELECT COUNT(*) FROM atenciones) a, (SELECT COUNT(*) FROM ruta_puntos) r');
    expect(n?.p).toBe(5);
    expect(n?.a).toBe(5);
    expect(n?.r).toBe(conteos.ruta_puntos);
    // El admin local sigue pudiendo entrar; el usuario restaurado queda inactivo sin credencial
    await expect(auth.iniciarSesion(destino.db, 'admin', 'Clave1234')).resolves.toBeTruthy();
    const restaurado = await destino.db.get<{ activo: number; usuario: string }>('SELECT activo, usuario FROM usuarios WHERE id = ?', [admin.id]);
    expect(restaurado?.activo).toBe(0);
    expect(restaurado?.usuario).not.toBe('admin');

    // Fusionar el mismo respaldo no duplica (UUID)
    await backup.restaurar(destino.db, admin2, texto, 'ClaveRespaldo2026', 'FUSIONAR');
    expect((await destino.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM pacientes'))?.n).toBe(5);

    await expect(backup.restaurar(destino.db, admin2, texto, 'Incorrecta2026', 'REEMPLAZAR')).rejects.toThrow(/contraseña incorrecta/);
  });

  it('exportación académica sin identificadores y con protección de fórmulas', async () => {
    const { db, admin, campId, rutaId } = await poblar();
    const { contenido } = await exportar.prepararCsvMatriz(db, admin, campId);
    const pacientesRows = await db.all<{ nombres: string; apellidos: string; codigo: string; id: string }>('SELECT * FROM pacientes');
    for (const p of pacientesRows) {
      expect(contenido).not.toContain(p.apellidos);
      expect(contenido).not.toContain(p.codigo);
      expect(contenido).not.toContain(p.id);
    }
    const atencionIds = await db.all<{ id: string }>('SELECT id FROM atenciones');
    for (const a of atencionIds) expect(contenido).not.toContain(a.id);
    expect(contenido.split('\r\n')[0]).toContain('codigo,campana_id,fecha,metodo,operador,tiempo_s');
    expect(exportar.celdaCsv('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(exportar.celdaCsv('-5')).toBe("'-5");

    const geo = JSON.parse((await exportar.prepararGeojson(db, admin, { rutaId, generalizada: false })).contenido);
    const lineas = geo.features.filter((f: { geometry: { type: string } }) => f.geometry.type === 'LineString');
    expect(lineas.length).toBe(2); // dos segmentos (pausa intermedia)
    expect(JSON.stringify(geo)).not.toMatch(/paciente/i);
    const gen = JSON.parse((await exportar.prepararGeojson(db, admin, { rutaId, generalizada: true })).contenido);
    const c = gen.features[0].geometry.coordinates[0];
    expect(Number(c[0].toFixed(3))).toBe(c[0]);
  });

  it('modo de datos reales bloqueado si fallan los controles', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    const sinCifrado = { sqlcipher: false, cipherVersion: null, claveEnAlmacenSeguro: true };
    await expect(seguridad.cambiarModo(db, admin, 'REAL', sinCifrado, { responsable: 'Dra. X', referencia: 'Oficio 1' })).rejects.toThrow(/SQLCipher/);
    const ok = { sqlcipher: true, cipherVersion: '4.6.1', claveEnAlmacenSeguro: true };
    await expect(seguridad.cambiarModo(db, admin, 'REAL', ok, { responsable: 'Dra. X', referencia: 'Oficio 1' })).rejects.toThrow(/Respaldo/);
    await guardarAjuste(db, 'respaldo_verificado_at', String(Date.now()));
    await seguridad.cambiarModo(db, admin, 'REAL', ok, { responsable: 'Dra. X', referencia: 'Oficio 1' });
    const campId = await campanas.crear(db, admin, { nombre: 'Campaña', sector: 'Pifo', inicio: '2026-11-15', fin: '', descripcion: '', responsable: 'Resp', estado: 'ACTIVA' });
    await expect(sintetico.generar(db, admin, campId, 2)).rejects.toThrow(/modo de prueba/);
    await expect(seguridad.purgarDatosPrueba(db, admin, 'REAL')).rejects.toThrow();
  });

  it('atención en vivo y ruta no comparten identificadores (sin asociar coordenadas a pacientes)', async () => {
    const { db, admin, rutaId } = await poblar();
    const cols = await db.all<{ name: string }>('PRAGMA table_info(ruta_puntos)');
    expect(cols.map((c) => c.name)).not.toContain('paciente_id');
    const det = await rutas.detalle(db, admin, rutaId);
    expect(det.ruta.origen).toBe('SINTETICO');
    const p = await db.get<{ id: string }>('SELECT id FROM pacientes LIMIT 1');
    await atenciones.registrar(db, admin, {
      pacienteId: p!.id, campanaId: det.ruta.campana_id, form: { ...ATENCION_FORM_VACIO, peso: '60' }, atipicosConfirmados: false,
      medicion: { inicioMs: Date.now() - 1000, busquedaS: null, erroresValidacion: 0, conectividad: 'EN_LINEA' },
    });
  });
});

describe('Acceso con huella o rostro', () => {
  const token = 'a'.repeat(64);

  it('entra con el token biométrico; en la base solo queda su hash', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    await auth.activarBiometria(db, admin, token);
    const fila = await db.get<{ h: string }>('SELECT biometria_hash AS h FROM usuarios WHERE id = ?', [admin.id]);
    expect(fila?.h).toMatch(/^[0-9a-f]{64}$/);
    expect(fila?.h).not.toBe(token);
    const u = await auth.iniciarSesionBiometrica(db, admin.id, token);
    expect(u.id).toBe(admin.id);
    await expect(auth.iniciarSesionBiometrica(db, admin.id, 'b'.repeat(64))).rejects.toThrow(/ya no es válido/);
    await auth.desbloquearBiometrico(db, admin.id, token);
    const audit = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM auditoria WHERE accion = 'LOGIN_OK' AND detalle = 'biometría'");
    expect(audit?.n).toBe(1);
  });

  it('cambiar la contraseña invalida la biometría; cuentas inactivas o con clave temporal no entran', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    await auth.activarBiometria(db, admin, token);
    await auth.cambiarClave(db, admin, 'Clave1234', 'OtraClave123');
    await expect(auth.iniciarSesionBiometrica(db, admin.id, token)).rejects.toThrow(/ya no es válido/);

    const id = await auth.crearUsuario(db, admin, { nombre: 'Operador Dos', usuario: 'op2', rol: 'OPERADOR', clave: 'Temporal123' });
    const op = auth.aActor((await auth.iniciarSesion(db, 'op2', 'Temporal123')));
    await auth.activarBiometria(db, op, token);
    await expect(auth.iniciarSesionBiometrica(db, id, token)).rejects.toThrow(/contraseña para cambiarla/);
    await auth.cambiarClave(db, op, 'Temporal123', 'Definitiva123');
    await auth.activarBiometria(db, op, token);
    await auth.actualizarUsuario(db, admin, id, { nombre: 'Operador Dos', rol: 'OPERADOR', activo: false });
    await expect(auth.iniciarSesionBiometrica(db, id, token)).rejects.toThrow(/desactivada/);
  });

  it('el respaldo nunca incluye el hash biométrico', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    await auth.activarBiometria(db, admin, token);
    const c = await backup.volcar(db);
    expect(c.tablas.usuarios?.every((u) => u.biometria_hash === null && u.credencial_protegida === null)).toBe(true);
  });
});

describe('Pasar a datos reales', () => {
  const ok = { sqlcipher: true, cipherVersion: '4.6.1', claveEnAlmacenSeguro: true };

  it('borra todos los datos de prueba, conserva usuarios y activa el modo real en un paso', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    const campId = await campanas.crear(db, admin, { nombre: 'Campaña', sector: 'Pifo', inicio: '2026-11-15', fin: '', descripcion: '', responsable: 'Resp', estado: 'ACTIVA' });
    await sintetico.generar(db, admin, campId, 4);
    await expect(seguridad.pasarADatosReales(db, admin, ok, { responsable: 'Dra. X', referencia: 'Oficio 1' })).rejects.toThrow(/Respaldo/);
    const { sobre } = await backup.crearRespaldo(db, admin, 'ClaveRespaldo2026');
    await backup.verificarRespaldo(db, admin, JSON.stringify(sobre), 'ClaveRespaldo2026');
    const borrado = await seguridad.pasarADatosReales(db, admin, ok, { responsable: 'Dra. X', referencia: 'Oficio 1' });
    expect(borrado.pacientes).toBe(4);
    const r = await seguridad.resumenDatos(db);
    expect(r).toEqual({ pacientes: 0, atenciones: 0, campanas: 0, rutas: 0, evaluaciones: 0 });
    expect(await leerAjusteModo(db)).toBe('REAL');
    await expect(auth.iniciarSesion(db, 'admin', 'Clave1234')).resolves.toBeTruthy();
    await expect(seguridad.pasarADatosReales(db, admin, ok, { responsable: 'Dra. X', referencia: 'Oficio 1' })).rejects.toThrow(/ya está/);
  });

  it('no procede con un recorrido GPS abierto ni sin cifrado', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    await guardarAjuste(db, 'respaldo_verificado_at', String(Date.now()));
    await expect(seguridad.pasarADatosReales(db, admin, { ...ok, sqlcipher: false }, { responsable: 'Dra. X', referencia: 'Oficio 1' })).rejects.toThrow(/SQLCipher/);
    const campId = await campanas.crear(db, admin, { nombre: 'Campaña', sector: 'Pifo', inicio: '2026-11-15', fin: '', descripcion: '', responsable: 'Resp', estado: 'ACTIVA' });
    await rutas.iniciar(db, admin, { campanaId: campId, modo: 'A_PIE', dispositivoId: 'd' });
    await expect(seguridad.pasarADatosReales(db, admin, ok, { responsable: 'Dra. X', referencia: 'Oficio 1' })).rejects.toThrow(/recorrido/);
  });
});

describe('Ingreso más rápido', () => {
  it('una contraseña antigua (60 000 iteraciones) se recalcula sola a 20 000 al ingresar', async () => {
    const { db } = await crearDbPrueba();
    const admin = await conAdmin(db);
    await db.run('UPDATE usuarios SET credencial_protegida = ? WHERE id = ?', [await protegerCredencial('Clave1234', 60_000), admin.id]);
    await auth.iniciarSesion(db, 'admin', 'Clave1234');
    const c = await db.get<{ c: string }>('SELECT credencial_protegida AS c FROM usuarios WHERE id = ?', [admin.id]);
    expect(c?.c.startsWith('pbkdf2-sha256$20000$')).toBe(true);
    await expect(auth.iniciarSesion(db, 'admin', 'Clave1234')).resolves.toBeTruthy();
  });
});

async function leerAjusteModo(db: Parameters<typeof guardarAjuste>[0]) {
  const r = await db.get<{ valor: string }>("SELECT valor FROM ajustes WHERE clave = 'modo_datos'");
  return r?.valor;
}
