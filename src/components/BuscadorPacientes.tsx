import { ChevronRight, Search, UserPlus } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Paciente } from '../domain/types';
import * as pacienteService from '../services/pacienteService';
import { mensajeError } from '../services/contexto';
import { useActor, useDb } from '../state/app';
import { colores, espacio, radio, tipo } from '../theme';
import { Avatar, Aviso, Boton, Vacio } from './ui';
import { fechaHora } from '../domain/time';

/** Búsqueda por código, nombres/apellidos, celular o cédula (datos autorizados). */
export function BuscadorPacientes({ onElegir, onCrear, autoFoco }: { onElegir: (p: Paciente) => void; onCrear?: () => void; autoFoco?: boolean }) {
  const db = useDb();
  const actor = useActor();
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Paciente[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const turno = useRef(0);

  useEffect(() => {
    const mio = ++turno.current;
    const t = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await pacienteService.buscar(db, actor, q);
        if (mio === turno.current) {
          setRes(r);
          setError(null);
        }
      } catch (e) {
        if (mio === turno.current) setError(mensajeError(e));
      } finally {
        if (mio === turno.current) setBuscando(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q, db, actor.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View>
      <View style={estilos.caja}>
        <Search size={20} color={colores.textoTenue} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Código, nombre, apellido o celular"
          placeholderTextColor={colores.textoTenue}
          style={estilos.input}
          autoFocus={autoFoco}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Buscar paciente"
        />
        {buscando ? <ActivityIndicator color={colores.primario} /> : null}
      </View>
      {error ? <Aviso tono="peligro" texto={error} /> : null}
      {res && res.length === 0 ? (
        <Vacio
          titulo={q ? 'Sin coincidencias' : 'Aún no hay pacientes'}
          mensaje={q ? 'Verifique la escritura o registre un paciente nuevo.' : 'Registre el primer paciente de la campaña.'}
          accion={onCrear ? <Boton titulo="Registrar paciente" icono={UserPlus} onPress={onCrear} /> : undefined}
        />
      ) : null}
      {res?.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => onElegir(p)}
          style={({ pressed }) => [estilos.fila, pressed && { backgroundColor: colores.primarioSuave }]}
          accessibilityRole="button"
          accessibilityLabel={`${p.nombres} ${p.apellidos}, ${p.codigo}`}
        >
          <Avatar nombres={p.nombres} apellidos={p.apellidos} />
          <View style={{ flex: 1 }}>
            <Text style={[tipo.cuerpo, { fontWeight: '600' }]}>{p.apellidos}, {p.nombres}</Text>
            <Text style={tipo.nota}>
              {p.codigo} · {p.edad != null ? `${p.edad} años` : 'edad s/d'} · {p.sector}
            </Text>
            <Text style={[tipo.nota, { color: p.n_atenciones ? colores.primario : colores.textoTenue }]}>
              {p.n_atenciones ? `${p.n_atenciones} atención(es) · última ${fechaHora(p.ultima_atencion)}` : 'Sin atenciones aún'}
            </Text>
          </View>
          <ChevronRight size={18} color={colores.textoTenue} />
        </Pressable>
      ))}
      {res && res.length > 0 && onCrear ? (
        <Boton titulo="¿No está? Registrar paciente nuevo" variante="fantasma" icono={UserPlus} onPress={onCrear} estilo={{ marginTop: espacio.sm }} />
      ) : null}
    </View>
  );
}

const estilos = StyleSheet.create({
  caja: {
    flexDirection: 'row', alignItems: 'center', gap: espacio.sm, backgroundColor: colores.superficie, borderRadius: radio.md,
    borderWidth: 1, borderColor: colores.bordeFuerte, paddingHorizontal: espacio.md, minHeight: 52, marginBottom: espacio.md,
  },
  input: { flex: 1, fontSize: 17, color: colores.texto, paddingVertical: 10 },
  fila: {
    flexDirection: 'row', alignItems: 'center', gap: espacio.md, padding: espacio.md, backgroundColor: colores.superficie,
    borderRadius: radio.md, borderWidth: 1, borderColor: colores.borde, marginBottom: espacio.sm,
  },
});
