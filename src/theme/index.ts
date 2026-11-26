import { useWindowDimensions } from 'react-native';

export const colores = {
  primario: '#0F5F59',
  primarioOscuro: '#0A4440',
  primarioSuave: '#E2F0EE',
  acento: '#E2702B', // recorrido GPS
  acentoSuave: '#FDEDE2',
  fondo: '#F3F6F5',
  superficie: '#FFFFFF',
  superficieAlt: '#F8FAF9',
  texto: '#101828',
  textoSec: '#475467',
  textoTenue: '#667085',
  borde: '#E4E7EC',
  bordeFuerte: '#D0D5DD',
  exito: '#067647',
  exitoSuave: '#DCFAE6',
  aviso: '#B54708',
  avisoSuave: '#FEF0C7',
  peligro: '#B42318',
  peligroSuave: '#FEE4E2',
  info: '#175CD3',
  infoSuave: '#D1E9FF',
  barra: '#2C8C83',
  mapaFondo: '#EEF2EF',
  mapaGrilla: '#DCE3DF',
} as const;

export const espacio = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radio = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const tipo = {
  titulo: { fontSize: 22, fontWeight: '700' as const, color: colores.texto },
  subtitulo: { fontSize: 17, fontWeight: '600' as const, color: colores.texto },
  cuerpo: { fontSize: 15, color: colores.texto },
  secundario: { fontSize: 14, color: colores.textoSec },
  nota: { fontSize: 12, color: colores.textoTenue },
  etiqueta: { fontSize: 13, fontWeight: '600' as const, color: colores.textoSec },
  cifra: { fontSize: 26, fontWeight: '700' as const, color: colores.texto, fontVariant: ['tabular-nums' as const] },
};

/** Diseño adaptable: teléfonos (1 columna) y tabletas (2–4 columnas, ancho máximo centrado). */
export function useResponsive() {
  const { width } = useWindowDimensions();
  const tablet = width >= 700;
  return {
    ancho: width,
    tablet,
    columnasKpi: width >= 1000 ? 4 : width >= 700 ? 3 : 2,
    anchoMax: tablet ? 980 : width,
  };
}
