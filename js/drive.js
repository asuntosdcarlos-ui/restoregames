// Subida de archivos al Google Drive de quien los sube.
// Usa el permiso "drive.file": la app solo ve los archivos que ella misma creó.
// Cada archivo se comparte como "cualquiera con el enlace puede ver".
import { CONFIG } from './config.js';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const API = 'https://www.googleapis.com/drive/v3/';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export const isConfigured = !!CONFIG.google?.clientId && !CONFIG.google.clientId.startsWith('TU_');

let token = null;
let tokenExp = 0;
let gisPromise = null;

export function preload() {
  if (!isConfigured) return Promise.resolve();
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gisPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = resolve;
    s.onerror = () => { gisPromise = null; reject(new Error('No se pudo cargar Google Identity Services.')); };
    document.head.appendChild(s);
  });
  return gisPromise;
}

async function getToken() {
  if (!isConfigured) throw new Error('Falta configurar google.clientId en js/config.js');
  if (token && Date.now() < tokenExp - 60_000) return token;
  await preload();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: CONFIG.google.clientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error) return reject(new Error(r.error_description || r.error));
        token = r.access_token;
        tokenExp = Date.now() + Number(r.expires_in || 3600) * 1000;
        resolve(token);
      },
      error_callback: (e) => reject(new Error(e?.type === 'popup_closed' ? 'Autorización cancelada.' : (e?.message || 'No se pudo autorizar Google Drive.'))),
    });
    client.requestAccessToken({ prompt: token ? '' : 'consent' });
  });
}

async function api(path, opts = {}) {
  const t = await getToken();
  const headers = { Authorization: `Bearer ${t}`, ...(opts.headers || {}) };
  if (typeof opts.body === 'string') headers['Content-Type'] = 'application/json';
  const r = await fetch(API + path, { ...opts, headers });
  if (!r.ok) throw new Error(`Google Drive respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json();
}

async function ensureFolder() {
  const KEY = 'rr_drive_folder';
  let id = localStorage.getItem(KEY);
  if (id) {
    try {
      const f = await api(`files/${id}?fields=id,trashed`);
      if (!f.trashed) return id;
    } catch { /* la carpeta ya no existe o es de otra cuenta */ }
  }
  const name = CONFIG.google.driveFolderName || 'RestoreGames';
  const q = encodeURIComponent(`name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const found = await api(`files?q=${q}&fields=files(id)&spaces=drive`);
  id = found.files?.[0]?.id;
  if (!id) {
    const created = await api('files?fields=id', {
      method: 'POST',
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder' }),
    });
    id = created.id;
  }
  localStorage.setItem(KEY, id);
  return id;
}

function entry(meta) {
  return {
    id: meta.id,
    name: meta.name,
    mimeType: meta.mimeType || '',
    size: Number(meta.size) || 0,
    view: `https://drive.google.com/file/d/${meta.id}/view`,
    download: `https://drive.google.com/uc?export=download&id=${meta.id}`,
    folder: false,
  };
}

/** Sube un File al Drive del usuario, lo hace público por enlace y devuelve la entrada. */
export async function uploadFile(file, onProgress) {
  const t = await getToken();
  const folder = await ensureFolder();
  const type = file.type || 'application/octet-stream';

  // 1) Sesión de subida reanudable (soporta archivos grandes)
  const init = await fetch(`${UPLOAD}?uploadType=resumable&fields=id,name,mimeType,size`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${t}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': type,
      'X-Upload-Content-Length': String(file.size),
    },
    body: JSON.stringify({ name: file.name, parents: [folder] }),
  });
  if (!init.ok) throw new Error(`No se pudo iniciar la subida (${init.status}).`);
  const location = init.headers.get('Location');
  if (!location) throw new Error('Google Drive no devolvió la URL de subida.');

  // 2) Envío del contenido con progreso
  const meta = await new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('PUT', location);
    x.setRequestHeader('Content-Type', type);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => (x.status < 300 ? resolve(JSON.parse(x.responseText)) : reject(new Error(`Error al subir (${x.status}).`)));
    x.onerror = () => reject(new Error('Error de red al subir el archivo.'));
    x.send(file);
  });

  // 3) Público con enlace (solo lectura)
  await api(`files/${meta.id}/permissions?fields=id`, {
    method: 'POST',
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });
  return entry(meta);
}

/** Convierte un enlace de Drive pegado a mano en una entrada de archivo. */
export function entryFromLink(url, name) {
  const u = String(url || '').trim();
  const folder = u.match(/\/folders\/([\w-]{10,})/);
  if (folder) {
    const id = folder[1];
    return { id, name: name || 'Carpeta de Drive', mimeType: 'folder', size: 0,
      view: `https://drive.google.com/drive/folders/${id}`, download: '', folder: true };
  }
  const m = u.match(/\/d\/([\w-]{10,})/) || u.match(/[?&]id=([\w-]{10,})/);
  if (!m) return null;
  return { ...entry({ id: m[1], name: name || 'Archivo de Drive' }) };
}
