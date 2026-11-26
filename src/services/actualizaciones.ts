import Constants from 'expo-constants';
import { compararVersiones } from '../domain/version';
import { ErrorNegocio } from './contexto';

/**
 * Actualizaciones de la APK publicadas como "Releases" de GitHub (repositorio público solo de descargas).
 * La consulta se hace SOLO cuando el usuario pulsa "Buscar actualización": no hay comprobaciones en segundo plano
 * ni se envían datos de la app (solo una petición GET anónima a la API pública de GitHub).
 */
const extra = (Constants.expoConfig?.extra ?? {}) as { actualizaciones?: { repo?: string } };
export const REPO_ACTUALIZACIONES = extra.actualizaciones?.repo ?? '';
export const NOMBRE_APK = 'vitalis-pifo.apk';

export function urlDescargaUltima(repo = REPO_ACTUALIZACIONES): string {
  return `https://github.com/${repo}/releases/latest/download/${NOMBRE_APK}`;
}

export interface InfoActualizacion {
  hayNueva: boolean;
  actual: string;
  ultima: string;
  notas: string;
  url: string;
  publicada: string | null;
  tamano: number | null;
}

export async function buscarActualizacion(actual = Constants.expoConfig?.version ?? '0.0.0', repo = REPO_ACTUALIZACIONES): Promise<InfoActualizacion> {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new ErrorNegocio('No hay un canal de actualizaciones configurado.');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);
  let resp: Response;
  try {
    resp = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: ctrl.signal,
    });
  } catch {
    throw new ErrorNegocio('Sin conexión a internet. Intente cuando tenga señal o Wi-Fi.');
  } finally {
    clearTimeout(t);
  }
  if (resp.status === 404) throw new ErrorNegocio('Aún no hay versiones publicadas.');
  if (!resp.ok) throw new ErrorNegocio(`No se pudo consultar las actualizaciones (HTTP ${resp.status}).`);
  const r = (await resp.json()) as { tag_name?: string; body?: string; published_at?: string; assets?: { name: string; browser_download_url: string; size?: number }[] };
  const ultima = (r.tag_name ?? '').replace(/^v/i, '');
  const apk = r.assets?.find((a) => a.name === NOMBRE_APK) ?? r.assets?.find((a) => a.name.endsWith('.apk'));
  return {
    hayNueva: !!ultima && compararVersiones(ultima, actual) > 0,
    actual,
    ultima: ultima || '—',
    notas: (r.body ?? '').slice(0, 600),
    url: apk?.browser_download_url ?? urlDescargaUltima(repo),
    publicada: r.published_at ?? null,
    tamano: apk?.size ?? null,
  };
}
