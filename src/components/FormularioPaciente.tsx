import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';
import { sectoresConocidos } from '../repositories/pacientes';
import { pacienteFormSchema, type PacienteForm } from '../schemas/paciente';
import { useApp, useDb } from '../state/app';
import { colores, espacio, radio, tipo, useResponsive } from '../theme';
import { Aviso, Boton, Campo, Interruptor, Segmentado, Seccion, Tarjeta } from './ui';

export function FormularioPaciente({
  inicial,
  textoGuardar,
  onGuardar,
  ocupado,
}: {
  inicial: PacienteForm;
  textoGuardar: string;
  onGuardar: (v: PacienteForm) => void;
  ocupado: boolean;
}) {
  const db = useDb();
  const { ajustes } = useApp();
  const { tablet } = useResponsive();
  const opcionales = ajustes.campos_opcionales === '1';
  const [sectores, setSectores] = useState<string[]>([]);
  const [verOpcionales, setVerOpcionales] = useState(!!(inicial.cedula || inicial.fecha_nacimiento || inicial.sexo));
  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<PacienteForm>({
    resolver: zodResolver(pacienteFormSchema),
    defaultValues: inicial,
  });
  const consentimiento = watch('consentimiento_contacto');
  const sectorActual = watch('sector');

  useEffect(() => {
    sectoresConocidos(db).then(setSectores).catch(() => setSectores([]));
  }, [db]);

  const col = { flex: tablet ? 1 : undefined, minWidth: tablet ? 220 : undefined };

  return (
    <View>
      <Tarjeta>
        <Seccion titulo="Datos del paciente">
          <View style={{ flexDirection: tablet ? 'row' : 'column', gap: tablet ? espacio.md : 0 }}>
            <View style={col}>
              <Controller control={control} name="nombres" render={({ field }) => (
                <Campo etiqueta="Nombres" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} autoCapitalize="words" error={errors.nombres?.message} requerido />
              )} />
            </View>
            <View style={col}>
              <Controller control={control} name="apellidos" render={({ field }) => (
                <Campo etiqueta="Apellidos" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} autoCapitalize="words" error={errors.apellidos?.message} requerido />
              )} />
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: espacio.md }}>
            <View style={{ width: 120 }}>
              <Controller control={control} name="edad" render={({ field }) => (
                <Campo etiqueta="Edad" value={field.value} onChangeText={field.onChange} keyboardType="number-pad" maxLength={3} unidad="años" error={errors.edad?.message} requerido={!opcionales} />
              )} />
            </View>
            <View style={{ flex: 1 }}>
              <Controller control={control} name="sector" render={({ field }) => (
                <Campo etiqueta="Sector / comunidad" value={field.value} onChangeText={field.onChange} autoCapitalize="words" error={errors.sector?.message} requerido />
              )} />
            </View>
          </View>
          {sectores.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: -4, marginBottom: espacio.md }}>
              {sectores.slice(0, 10).map((s) => (
                <Pressable
                  key={s}
                  onPress={() => setValue('sector', s, { shouldValidate: true })}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: radio.pill, backgroundColor: s === sectorActual ? colores.primario : colores.primarioSuave }}
                  accessibilityRole="button"
                  accessibilityLabel={`Sector ${s}`}
                >
                  <Text style={{ color: s === sectorActual ? '#fff' : colores.primario, fontSize: 13, fontWeight: '600' }}>{s}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          <Controller control={control} name="telefono" render={({ field }) => (
            <Campo etiqueta="Celular (solo si se necesita contacto)" value={field.value} onChangeText={field.onChange} keyboardType="phone-pad" maxLength={10} placeholder="09XXXXXXXX" error={errors.telefono?.message} />
          )} />
        </Seccion>
      </Tarjeta>

      <Tarjeta>
        <Seccion titulo="Consentimiento de contacto">
          <Controller control={control} name="consentimiento_contacto" render={({ field }) => (
            <Interruptor
              etiqueta="Autoriza ser contactado para seguimiento"
              descripcion={`Independiente de la atención. Desactivado por defecto. Aviso de privacidad v${ajustes.aviso_version}.`}
              valor={field.value}
              onCambio={(v) => {
                field.onChange(v);
                if (!v) setValue('canal_preferido', 'NINGUNO');
              }}
            />
          )} />
          {consentimiento ? (
            <Controller control={control} name="canal_preferido" render={({ field }) => (
              <Segmentado
                etiqueta="Canal preferido"
                valor={field.value}
                onCambio={field.onChange}
                error={errors.canal_preferido?.message}
                opciones={[{ valor: 'WHATSAPP', texto: 'WhatsApp' }, { valor: 'SMS', texto: 'SMS' }, { valor: 'NINGUNO', texto: 'Ninguno' }]}
              />
            )} />
          ) : null}
          <Text style={tipo.nota}>Esta versión no envía mensajes: solo registra la autorización y el canal.</Text>
        </Seccion>
      </Tarjeta>

      {opcionales ? (
        <Tarjeta>
          <Pressable
            onPress={() => setVerOpcionales((v) => !v)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: espacio.sm, minHeight: 40 }}
            accessibilityRole="button"
            accessibilityState={{ expanded: verOpcionales }}
          >
            <Text style={[tipo.subtitulo, { flex: 1 }]}>Datos opcionales</Text>
            <Text style={[tipo.nota, { color: colores.primario, fontWeight: '700' }]}>{verOpcionales ? 'Ocultar' : 'Completar'}</Text>
          </Pressable>
          <Text style={tipo.nota}>Cédula, fecha de nacimiento y sexo. Llénelos solo si el paciente los proporciona.</Text>
          {verOpcionales ? (
          <View style={{ marginTop: espacio.md }}>
            <Controller control={control} name="cedula" render={({ field }) => (
              <Campo etiqueta="Cédula" value={field.value} onChangeText={field.onChange} keyboardType="number-pad" maxLength={10} error={errors.cedula?.message} />
            )} />
            <Controller control={control} name="fecha_nacimiento" render={({ field }) => (
              <Campo etiqueta="Fecha de nacimiento" value={field.value} onChangeText={field.onChange} placeholder="AAAA-MM-DD" maxLength={10} error={errors.fecha_nacimiento?.message} ayuda="Si se ingresa, la edad se calcula automáticamente cuando falte." />
            )} />
            <Controller control={control} name="sexo" render={({ field }) => (
              <Segmentado etiqueta="Sexo" valor={field.value} onCambio={field.onChange} opciones={[{ valor: '', texto: 'No registrar' }, { valor: 'F', texto: 'F' }, { valor: 'M', texto: 'M' }, { valor: 'OTRO', texto: 'Otro' }]} />
            )} />
          </View>
          ) : null}
        </Tarjeta>
      ) : null}

      {Object.keys(errors).length > 0 ? <Aviso tono="peligro" texto="Revise los campos marcados." /> : null}
      <Boton titulo={textoGuardar} onPress={handleSubmit(onGuardar)} cargando={ocupado} grande />
    </View>
  );
}
