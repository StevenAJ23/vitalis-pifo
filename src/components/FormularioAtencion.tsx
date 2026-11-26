import { zodResolver } from '@hookform/resolvers/zod';
import { Check, TriangleAlert } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Controller, useForm, type FieldErrors } from 'react-hook-form';
import { Pressable, Text, View } from 'react-native';
import { calcularImc, formatearImc } from '../domain/imc';
import { fechaISO } from '../domain/time';
import { RANGOS, detectarAtipicos, type CampoVital } from '../domain/vitals';
import { atencionFormSchema, medicionesDe, type AtencionForm } from '../schemas/atencion';
import { colores, espacio, radio, tipo, useResponsive } from '../theme';
import { Aviso, Boton, Campo, DatoFila, Interruptor, Segmentado, Seccion, Tarjeta } from './ui';

const OIDO = [
  { valor: 'NO_EVALUADO' as const, texto: 'No evaluado' },
  { valor: 'SI' as const, texto: 'Sí' },
  { valor: 'NO' as const, texto: 'No' },
];
const TXT_OIDO = { SI: 'Sí', NO: 'No', NO_EVALUADO: 'No evaluado' };
/** Orden de captura: el botón "Siguiente" del teclado salta al próximo campo. */
const ORDEN_CAMPOS: CampoVital[] = ['sistolica', 'diastolica', 'frecuencia', 'temperatura', 'spo2', 'peso', 'talla_cm'];

interface Props {
  inicial: AtencionForm;
  correccion?: boolean;
  ocupado: boolean;
  onPrimeraEdicion?: () => void;
  onErrorValidacion?: () => void;
  onGuardar: (v: AtencionForm, atipicosConfirmados: boolean) => void;
}

/**
 * Captura → revisión → guardado. Mediciones vacías se guardan como nulas (nunca cero).
 * Los valores atípicos se señalan para revisión médica sin emitir diagnósticos.
 */
export function FormularioAtencion({ inicial, correccion, ocupado, onPrimeraEdicion, onErrorValidacion, onGuardar }: Props) {
  const { tablet } = useResponsive();
  const [revision, setRevision] = useState<AtencionForm | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const editado = useRef(false);
  const { control, handleSubmit, watch, setValue, setFocus, formState: { errors } } = useForm<AtencionForm>({
    resolver: zodResolver(atencionFormSchema),
    defaultValues: inicial,
  });
  const peso = watch('peso');
  const talla = watch('talla_cm');
  const seguimiento = watch('seguimiento');
  const m = medicionesDe({ ...watch() });
  const imc = calcularImc(m.peso, m.talla_cm);

  const tocar = () => {
    if (!editado.current) {
      editado.current = true;
      onPrimeraEdicion?.();
    }
  };

  const vital = (campo: CampoVital) => {
    const r = RANGOS[campo];
    const i = ORDEN_CAMPOS.indexOf(campo);
    const siguiente = ORDEN_CAMPOS[i + 1];
    const valor = m[campo];
    const atipico = valor != null && (valor < r.atipicoBajo || valor > r.atipicoAlto);
    const habitual = r.atipicoAlto > r.max ? `≥ ${r.atipicoBajo}` : `${r.atipicoBajo}–${r.atipicoAlto}`;
    return (
      <Controller
        control={control}
        name={campo}
        render={({ field }) => (
          <Campo
            etiqueta={r.etiqueta}
            value={field.value}
            onChangeText={(t) => {
              tocar();
              field.onChange(t.replace(/[^0-9.,]/g, ''));
            }}
            onBlur={field.onBlur}
            refEntrada={field.ref}
            keyboardType="decimal-pad"
            returnKeyType={siguiente ? 'next' : 'done'}
            submitBehavior={siguiente ? 'submit' : 'blurAndSubmit'}
            onSubmitEditing={() => (siguiente ? setFocus(siguiente) : undefined)}
            unidad={r.unidad}
            placeholder={r.pista}
            maxLength={6}
            error={errors[campo]?.message}
            advertencia={atipico ? `Fuera de lo habitual (${habitual}). Verifique la medición.` : undefined}
            ayuda={`Habitual ${habitual} ${r.unidad}`}
          />
        )}
      />
    );
  };

  const celda = { width: tablet ? '33.33%' : '50%', paddingHorizontal: 4 } as const;

  const alRevisar = handleSubmit(
    (v) => {
      setConfirmado(false);
      setRevision(v);
    },
    (_e: FieldErrors<AtencionForm>) => onErrorValidacion?.(),
  );

  if (revision) {
    const mr = medicionesDe(revision);
    const imcR = calcularImc(mr.peso, mr.talla_cm);
    const atip = detectarAtipicos(mr, imcR);
    const v = (c: CampoVital) => (mr[c] == null ? 'No registrado' : `${String(mr[c]).replace('.', ',')} ${RANGOS[c].unidad}`);
    return (
      <View>
        <Tarjeta>
          <Seccion titulo="Revise los datos antes de guardar">
            <DatoFila etiqueta="Presión arterial" valor={mr.sistolica != null ? `${mr.sistolica}/${mr.diastolica} mmHg` : 'No registrada'} />
            <DatoFila etiqueta="Frecuencia cardíaca" valor={v('frecuencia')} />
            <DatoFila etiqueta="Temperatura" valor={v('temperatura')} />
            <DatoFila etiqueta="Saturación O₂" valor={v('spo2')} />
            <DatoFila etiqueta="Peso" valor={v('peso')} />
            <DatoFila etiqueta="Talla" valor={v('talla_cm')} />
            <DatoFila etiqueta="IMC" valor={imcR == null ? 'No calculable' : `${formatearImc(imcR)} kg/m²`} />
            <DatoFila etiqueta="Tapón oído izquierdo" valor={TXT_OIDO[revision.oido_i]} />
            <DatoFila etiqueta="Tapón oído derecho" valor={TXT_OIDO[revision.oido_d]} />
            <DatoFila etiqueta="Seguimiento" valor={revision.seguimiento ? (revision.cita_at ? `Sí · cita ${revision.cita_at}` : 'Sí') : 'No'} />
            {revision.observaciones.trim() ? <DatoFila etiqueta="Observaciones" valor={revision.observaciones.trim()} /> : null}
            {correccion ? <DatoFila etiqueta="Motivo de corrección" valor={revision.motivo_correccion} /> : null}
          </Seccion>
        </Tarjeta>
        {atip.length > 0 ? (
          <Tarjeta style={{ borderColor: colores.aviso }}>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: espacio.sm }}>
              <TriangleAlert size={18} color={colores.aviso} />
              <Text style={[tipo.subtitulo, { color: colores.aviso }]}>Valores atípicos ({atip.length})</Text>
            </View>
            {atip.map((a, i) => <Text key={i} style={[tipo.secundario, { marginBottom: 4 }]}>• {a.mensaje}</Text>)}
            <Text style={[tipo.nota, { marginVertical: espacio.sm }]}>
              No es un diagnóstico. El registro quedará marcado para revisión por personal médico.
            </Text>
            <Pressable
              onPress={() => setConfirmado((c) => !c)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmado }}
            >
              <View style={{ width: 26, height: 26, borderRadius: 6, borderWidth: 2, borderColor: colores.primario, backgroundColor: confirmado ? colores.primario : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {confirmado ? <Check size={16} color="#fff" /> : null}
              </View>
              <Text style={[tipo.cuerpo, { flex: 1 }]}>Verifiqué los valores y las unidades con la medición</Text>
            </Pressable>
          </Tarjeta>
        ) : null}
        <Boton
          titulo={correccion ? 'Confirmar corrección' : 'Confirmar y guardar'}
          grande
          cargando={ocupado}
          deshabilitado={atip.length > 0 && !confirmado}
          onPress={() => onGuardar(revision, atip.length > 0 && confirmado)}
        />
        <Boton titulo="Volver a editar" variante="fantasma" onPress={() => setRevision(null)} estilo={{ marginTop: espacio.sm }} deshabilitado={ocupado} />
      </View>
    );
  }

  const en7 = new Date();
  en7.setDate(en7.getDate() + 7);

  return (
    <View>
      <Tarjeta>
        <Seccion titulo="Signos vitales">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            <View style={celda}>{vital('sistolica')}</View>
            <View style={celda}>{vital('diastolica')}</View>
            <View style={celda}>{vital('frecuencia')}</View>
            <View style={celda}>{vital('temperatura')}</View>
            <View style={celda}>{vital('spo2')}</View>
          </View>
        </Seccion>
        <Seccion titulo="Antropometría">
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 }}>
            <View style={celda}>{vital('peso')}</View>
            <View style={celda}>{vital('talla_cm')}</View>
            <View style={celda}>
              <Text style={[tipo.etiqueta, { marginBottom: 6 }]}>IMC (automático)</Text>
              <View style={{ minHeight: 50, borderRadius: radio.md, backgroundColor: colores.primarioSuave, justifyContent: 'center', paddingHorizontal: espacio.md }} accessibilityLabel={`IMC ${formatearImc(imc)}`}>
                <Text style={[tipo.subtitulo, { color: colores.primario }]}>{imc == null ? (peso || talla ? 'Falta peso o talla' : '—') : `${formatearImc(imc)} kg/m²`}</Text>
              </View>
            </View>
          </View>
        </Seccion>
        <Seccion titulo="Tapón de cerumen">
          <Controller control={control} name="oido_i" render={({ field }) => (
            <Segmentado etiqueta="Oído izquierdo" valor={field.value} onCambio={(x) => { tocar(); field.onChange(x); }} opciones={OIDO} />
          )} />
          <Controller control={control} name="oido_d" render={({ field }) => (
            <Segmentado etiqueta="Oído derecho" valor={field.value} onCambio={(x) => { tocar(); field.onChange(x); }} opciones={OIDO} />
          )} />
        </Seccion>
      </Tarjeta>

      <Tarjeta>
        <Controller control={control} name="observaciones" render={({ field }) => (
          <Campo
            etiqueta="Observaciones autorizadas"
            value={field.value}
            onChangeText={(t) => { tocar(); field.onChange(t); }}
            multiline
            maxLength={500}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
            ayuda="Solo información autorizada. Sin diagnósticos automáticos."
            error={errors.observaciones?.message}
          />
        )} />
        <Controller control={control} name="seguimiento" render={({ field }) => (
          <Interruptor etiqueta="Requiere seguimiento" valor={field.value} onCambio={(x) => { tocar(); field.onChange(x); if (!x) setValue('cita_at', ''); }} />
        )} />
        {errors.seguimiento ? <Text style={{ color: colores.peligro, fontSize: 13 }}>{errors.seguimiento.message}</Text> : null}
        {seguimiento ? (
          <>
            <Controller control={control} name="cita_at" render={({ field }) => (
              <Campo etiqueta="Cita (opcional)" value={field.value} onChangeText={field.onChange} placeholder="AAAA-MM-DD HH:MM" maxLength={16} error={errors.cita_at?.message} />
            )} />
            <Boton titulo={`Proponer ${fechaISO(en7.getTime())} 08:00`} variante="secundario" compacto onPress={() => setValue('cita_at', `${fechaISO(en7.getTime())} 08:00`, { shouldValidate: true })} />
          </>
        ) : null}
      </Tarjeta>

      {correccion ? (
        <Tarjeta>
          <Controller control={control} name="motivo_correccion" render={({ field }) => (
            <Campo etiqueta="Motivo de la corrección" value={field.value} onChangeText={field.onChange} maxLength={200} ayuda="Obligatorio. Se guarda la versión anterior y queda en la auditoría." requerido />
          )} />
        </Tarjeta>
      ) : null}

      {Object.keys(errors).length > 0 ? <Aviso tono="peligro" texto="Hay datos con errores. Corrija los campos marcados." /> : null}
      <Boton titulo="Revisar" grande onPress={alRevisar} />
    </View>
  );
}
