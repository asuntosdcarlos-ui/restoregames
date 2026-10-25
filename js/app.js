import { CONFIG } from './config.js';
import { createStore, isDemo } from './store.js';
import * as Drive from './drive.js';

const $app = document.getElementById('app');
const $user = document.getElementById('user-area');
let store = null;
let user = null;
let authReady = false;
const cache = new Map();

// ───────────────────────── utilidades ─────────────────────────
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (ms) => new Date(ms).toLocaleDateString('es', { year: 'numeric', month: 'short', day: 'numeric' });
const fmtSize = (b) => {
  if (!b) return '';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0;
  while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
  return `${b.toFixed(i ? 1 : 0)} ${u[i]}`;
};
const md = (src) => window.DOMPurify.sanitize(window.marked.parse(src || ''), { ADD_ATTR: ['target'] });
const excerpt = (src, n = 110) => {
  const t = String(src || '').replace(/[#>*_`|\-\[\]()!]/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n).trimEnd() + '…' : t;
};
const go = (hash) => { location.hash = hash; };
const icon = (n) => esc(n.icon || '📁');

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.classList.add('out'), 3200);
  setTimeout(() => el.remove(), 3700);
}
const loading = () => { $app.innerHTML = '<div class="loading"><span></span><span></span><span></span></div>'; };
const errorView = (msg) => { $app.innerHTML = `<div class="empty"><h2>Algo salió mal</h2><p>${esc(msg)}</p><a class="btn" href="#/">Volver al inicio</a></div>`; };

async function getNode(id, fresh = false) {
  if (!fresh && cache.has(id)) return cache.get(id);
  const n = await store.getNode(id);
  if (n) cache.set(id, n); else cache.delete(id);
  return n;
}

const canEdit = (n) => !!user && (user.uid === n.authorId || user.isAdmin || n.openEdit);
const canDelete = (n) => !!user && (user.uid === n.authorId || user.isAdmin);

// ───────────────────────── cabecera ─────────────────────────
function renderUser() {
  if (!authReady) { $user.innerHTML = ''; return; }
  if (!user) {
    $user.innerHTML = '<a class="btn small" href="#/entrar">Entrar</a>';
    return;
  }
  const initial = esc((user.name || '?')[0].toUpperCase());
  $user.innerHTML = `
    <span class="who" title="${esc(user.email || '')}">
      ${user.photo ? `<img src="${esc(user.photo)}" alt="" referrerpolicy="no-referrer">` : `<b>${initial}</b>`}
      <span>${esc(user.name)}${user.isAdmin ? ' <em>admin</em>' : ''}</span>
    </span>
    <button class="btn small ghost" id="logout">Salir</button>`;
  document.getElementById('logout').onclick = async () => { await store.signOut(); toast('Sesión cerrada'); };
}

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = e.target.q.value.trim();
  if (q) go(`#/buscar?q=${encodeURIComponent(q)}`);
});

// ───────────────────────── vistas ─────────────────────────
function cardGrid(nodes) {
  return `<div class="grid">${nodes.map((n) => `
    <a class="card" href="#/n/${esc(n.id)}">
      <span class="card-icon">${icon(n)}</span>
      <span class="card-body">
        <strong>${esc(n.title)}</strong>
        <small>${esc(excerpt(n.content)) || '&nbsp;'}</small>
      </span>
    </a>`).join('')}</div>`;
}

async function viewHome() {
  loading();
  const [roots, recent] = await Promise.all([store.getChildren(null), store.recent(8)]);
  roots.forEach((n) => cache.set(n.id, n));
  $app.innerHTML = `
    <section class="hero">
      <h1>${esc(CONFIG.siteName)}</h1>
      <p>${esc(CONFIG.tagline)}</p>
      ${isDemo ? '<p class="demo-note">Modo demo: los datos se guardan solo en este navegador. Configura Firebase en <code>js/config.js</code> para publicar.</p>' : ''}
    </section>
    <section>
      <div class="section-head">
        <h2>Juegos y categorías</h2>
        ${user?.isAdmin ? '<a class="btn" href="#/nuevo">+ Nueva categoría</a>' : ''}
      </div>
      ${roots.length ? cardGrid(roots) : '<p class="muted">Todavía no hay categorías.</p>'}
    </section>
    <section>
      <h2>Actualizado recientemente</h2>
      ${recent.length ? `<ul class="recent">${recent.map((n) => `
        <li><a href="#/n/${esc(n.id)}">${icon(n)} ${esc(n.title)}</a>
        <span class="muted">${esc(n.updatedByName || n.authorName)} · ${fmtDate(n.updatedAt)}</span></li>`).join('')}</ul>`
        : '<p class="muted">Nada por aquí aún.</p>'}
    </section>`;
}

async function breadcrumbs(node) {
  const parts = await Promise.all((node.ancestors || []).map((id) => getNode(id)));
  const links = parts.filter(Boolean).map((p) => `<a href="#/n/${esc(p.id)}">${esc(p.title)}</a>`);
  return `<nav class="crumbs"><a href="#/">Inicio</a>${links.map((l) => `<i>›</i>${l}`).join('')}<i>›</i><span>${esc(node.title)}</span></nav>`;
}

function filesBlock(files) {
  if (!files?.length) return '';
  return `
    <section class="files">
      <h2>Archivos</h2>
      <ul>${files.map((f) => `
        <li>
          <span class="file-icon">${f.folder ? '📂' : '📄'}</span>
          <span class="file-name">${esc(f.name)}<small>${esc(fmtSize(f.size))}</small></span>
          <a class="btn small ghost" href="${esc(f.view)}" target="_blank" rel="noopener">Ver en Drive</a>
          ${f.download ? `<a class="btn small" href="${esc(f.download)}" target="_blank" rel="noopener">Descargar</a>` : ''}
        </li>`).join('')}
      </ul>
    </section>`;
}

async function viewNode(id) {
  loading();
  const node = await getNode(id, true);
  if (!node) return errorView('Esta página no existe o fue eliminada.');
  const [crumbs, children] = await Promise.all([breadcrumbs(node), store.getChildren(id)]);
  children.forEach((n) => cache.set(n.id, n));
  document.title = `${node.title} · ${CONFIG.siteName}`;

  $app.innerHTML = `
    ${crumbs}
    <header class="page-head">
      <span class="page-icon">${icon(node)}</span>
      <div>
        <h1>${esc(node.title)}</h1>
        <p class="meta">Creado por ${esc(node.authorName)} · actualizado ${fmtDate(node.updatedAt)}${node.updatedByName && node.updatedByName !== node.authorName ? ` por ${esc(node.updatedByName)}` : ''}${node.openEdit ? ' · <span class="tag">edición abierta</span>' : ''}</p>
      </div>
      <div class="actions">
        ${canEdit(node) ? `<a class="btn ghost" href="#/editar/${esc(id)}">Editar</a>` : ''}
        ${canDelete(node) ? '<button class="btn danger ghost" id="del">Eliminar</button>' : ''}
      </div>
    </header>
    ${node.content ? `<article class="prose">${md(node.content)}</article>` : ''}
    ${filesBlock(node.files)}
    <section>
      <div class="section-head">
        <h2>Subtemas <span class="count">${children.length}</span></h2>
        ${user ? `<a class="btn" href="#/nuevo/${esc(id)}">+ Nuevo subtema</a>` : '<a class="btn ghost" href="#/entrar">Entra para añadir subtemas</a>'}
      </div>
      ${children.length ? cardGrid(children) : '<p class="muted">Aún no hay subtemas aquí.</p>'}
    </section>`;

  $app.querySelectorAll('.prose a[href^="http"]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener'; });
  const del = document.getElementById('del');
  if (del) del.onclick = async () => {
    if (!confirm(`¿Eliminar "${node.title}"? Los archivos seguirán en Google Drive.`)) return;
    try {
      await store.deleteNode(id);
      cache.delete(id);
      toast('Página eliminada');
      go(node.parentId ? `#/n/${node.parentId}` : '#/');
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function viewEditor({ id = null, parentId = null }) {
  if (!user) { toast('Necesitas iniciar sesión', 'err'); return go('#/entrar'); }
  loading();
  const node = id ? await getNode(id, true) : null;
  if (id && !node) return errorView('Esta página no existe.');
  if (node && !canEdit(node)) return errorView('No tienes permiso para editar esta página.');
  if (!id && !parentId && !user.isAdmin) return errorView('Solo los administradores pueden crear categorías principales.');
  const parent = parentId ? await getNode(parentId) : null;
  if (parentId && !parent) return errorView('La página superior no existe.');

  const files = [...(node?.files || [])];
  const owner = !node || node.authorId === user.uid || user.isAdmin;
  Drive.preload().catch(() => {});

  $app.innerHTML = `
    <nav class="crumbs"><a href="#/">Inicio</a><i>›</i>
      ${node ? `<a href="#/n/${esc(node.id)}">${esc(node.title)}</a><i>›</i><span>Editar</span>`
        : parent ? `<a href="#/n/${esc(parent.id)}">${esc(parent.title)}</a><i>›</i><span>Nuevo subtema</span>` : '<span>Nueva categoría</span>'}
    </nav>
    <form class="editor" id="editor" autocomplete="off">
      <div class="row">
        <label class="f-icon">Icono<input name="icon" maxlength="4" value="${esc(node?.icon || '')}" placeholder="🧩"></label>
        <label class="f-title">Título<input name="title" required maxlength="120" value="${esc(node?.title || '')}" placeholder="${parent ? 'Ej: OptiFine 1.7.10' : 'Ej: Minecraft'}"></label>
      </div>

      <div class="tabs">
        <button type="button" class="tab on" data-tab="write">Escribir</button>
        <button type="button" class="tab" data-tab="preview">Vista previa</button>
        <span class="hint">Markdown: <code>## Título</code> <code>**negrita**</code> <code>- lista</code> <code>[enlace](url)</code> <code>| tabla |</code></span>
      </div>
      <textarea name="content" rows="18" placeholder="Toda la información sobre este tema…">${esc(node?.content || '')}</textarea>
      <div class="prose preview" hidden></div>

      <fieldset class="files-edit">
        <legend>Archivos (Google Drive)</legend>
        <ul id="file-list"></ul>
        <div class="upload-row">
          <label class="btn ${Drive.isConfigured ? '' : 'disabled'}">
            Subir a mi Drive
            <input type="file" id="file-input" multiple hidden ${Drive.isConfigured ? '' : 'disabled'}>
          </label>
          <span class="muted">${Drive.isConfigured ? 'Se guardan en tu Google Drive y se comparten por enlace.' : 'Configura google.clientId para subir directamente. Mientras, pega enlaces de Drive:'}</span>
        </div>
        <div class="row link-row">
          <input id="link-url" placeholder="https://drive.google.com/file/d/…">
          <input id="link-name" placeholder="Nombre a mostrar">
          <button type="button" class="btn ghost" id="add-link">Añadir enlace</button>
        </div>
      </fieldset>

      ${owner ? `<label class="check"><input type="checkbox" name="openEdit" ${node?.openEdit ? 'checked' : ''}> Permitir que cualquier usuario registrado edite esta página</label>` : ''}

      <div class="form-actions">
        <a class="btn ghost" href="${node ? `#/n/${esc(node.id)}` : parent ? `#/n/${esc(parent.id)}` : '#/'}">Cancelar</a>
        <button class="btn primary" type="submit" id="save">${node ? 'Guardar cambios' : 'Crear página'}</button>
      </div>
    </form>`;

  const form = document.getElementById('editor');
  const ta = form.elements.content;
  const preview = form.querySelector('.preview');
  const list = document.getElementById('file-list');
  let uploading = 0;

  form.querySelectorAll('.tab').forEach((t) => t.onclick = () => {
    form.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === t));
    const pv = t.dataset.tab === 'preview';
    if (pv) preview.innerHTML = md(ta.value) || '<p class="muted">Nada que mostrar.</p>';
    preview.hidden = !pv; ta.hidden = pv;
  });

  function renderFiles() {
    list.innerHTML = files.length ? files.map((f, i) => `
      <li data-i="${i}">
        <span class="file-icon">${f.uploading ? '⏳' : f.folder ? '📂' : '📄'}</span>
        <span class="file-name">${esc(f.name)}<small>${f.uploading ? `${Math.round(f.progress * 100)}%` : esc(fmtSize(f.size))}</small></span>
        ${f.uploading ? `<progress max="1" value="${f.progress}"></progress>` : `<a class="btn small ghost" href="${esc(f.view)}" target="_blank" rel="noopener">Abrir</a>
        <button type="button" class="btn small danger ghost" data-rm="${i}">Quitar</button>`}
      </li>`).join('') : '<li class="muted">Sin archivos.</li>';
    list.querySelectorAll('[data-rm]').forEach((b) => b.onclick = () => { files.splice(+b.dataset.rm, 1); renderFiles(); });
  }
  renderFiles();

  document.getElementById('file-input')?.addEventListener('change', async (e) => {
    const picked = [...e.target.files];
    e.target.value = '';
    for (const file of picked) {
      const slot = { name: file.name, uploading: true, progress: 0 };
      files.push(slot); renderFiles(); uploading++;
      try {
        const done = await Drive.uploadFile(file, (p) => { slot.progress = p; renderFiles(); });
        files.splice(files.indexOf(slot), 1, done);
        toast(`Subido: ${file.name}`);
      } catch (err) {
        files.splice(files.indexOf(slot), 1);
        toast(err.message, 'err');
      } finally { uploading--; renderFiles(); }
    }
  });

  document.getElementById('add-link').onclick = () => {
    const url = document.getElementById('link-url');
    const name = document.getElementById('link-name');
    const f = Drive.entryFromLink(url.value, name.value.trim());
    if (!f) return toast('Ese no parece un enlace de Google Drive', 'err');
    files.push(f); url.value = ''; name.value = ''; renderFiles();
  };

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (uploading) return toast('Espera a que terminen las subidas', 'err');
    const data = {
      title: form.elements.title.value,
      icon: form.elements.icon.value,
      content: ta.value,
      files: files.filter((f) => !f.uploading),
    };
    if (form.elements.openEdit) data.openEdit = form.elements.openEdit.checked;
    if (!data.title.trim()) return toast('El título es obligatorio', 'err');
    const btn = document.getElementById('save');
    btn.disabled = true;
    try {
      if (node) {
        await store.updateNode(node.id, data, user);
        cache.delete(node.id);
        toast('Cambios guardados');
        go(`#/n/${node.id}`);
      } else {
        const newId = await store.createNode({ ...data, parentId }, user);
        toast('Página creada');
        go(`#/n/${newId}`);
      }
    } catch (err) {
      toast(err.code === 'permission-denied' ? 'No tienes permiso para esto.' : err.message, 'err');
      btn.disabled = false;
    }
  };
}

async function viewSearch(q) {
  loading();
  const results = await store.search(q);
  document.getElementById('search-form').q.value = q;
  const crumbsFor = async (n) => {
    const ps = await Promise.all((n.ancestors || []).map((a) => getNode(a)));
    return ps.filter(Boolean).map((p) => esc(p.title)).join(' › ');
  };
  const paths = await Promise.all(results.map(crumbsFor));
  $app.innerHTML = `
    <h1>Resultados para “${esc(q)}”</h1>
    ${results.length ? `<ul class="recent">${results.map((n, i) => `
      <li><a href="#/n/${esc(n.id)}">${icon(n)} ${esc(n.title)}</a>
      <span class="muted">${paths[i] || 'Categoría principal'}</span></li>`).join('')}</ul>`
      : `<p class="muted">Sin resultados.${isDemo ? '' : ' La búsqueda compara el inicio del título.'}</p>`}`;
}

function viewLogin() {
  if (user) return go('#/');
  if (isDemo) {
    $app.innerHTML = `
      <div class="auth">
        <h1>Entrar (demo)</h1>
        <p class="muted">En modo demo cualquier nombre entra como administrador.</p>
        <form id="demo-form"><input name="name" required placeholder="Tu nombre" maxlength="40"><button class="btn primary">Entrar</button></form>
      </div>`;
    document.getElementById('demo-form').onsubmit = async (e) => {
      e.preventDefault();
      await store.signInDemo(e.target.elements.name.value.trim());
      go('#/');
    };
    return;
  }
  let mode = 'login';
  const draw = () => {
    $app.innerHTML = `
      <div class="auth">
        <h1>${mode === 'login' ? 'Entrar' : 'Crear cuenta'}</h1>
        <button class="btn google" id="g">Continuar con Google</button>
        <div class="or"><span>o con correo</span></div>
        <form id="email-form">
          ${mode === 'signup' ? '<input name="name" required maxlength="40" placeholder="Nombre de usuario">' : ''}
          <input name="email" type="email" required placeholder="Correo">
          <input name="pass" type="password" required minlength="6" placeholder="Contraseña">
          <button class="btn primary">${mode === 'login' ? 'Entrar' : 'Registrarme'}</button>
        </form>
        <p class="muted">${mode === 'login' ? '¿No tienes cuenta?' : '¿Ya tienes cuenta?'} <a href="#" id="swap">${mode === 'login' ? 'Regístrate' : 'Entra'}</a></p>
      </div>`;
    const fail = (e) => toast(authMessage(e), 'err');
    document.getElementById('g').onclick = () => store.signInGoogle().then(() => go('#/')).catch(fail);
    document.getElementById('swap').onclick = (e) => { e.preventDefault(); mode = mode === 'login' ? 'signup' : 'login'; draw(); };
    document.getElementById('email-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        if (mode === 'login') await store.signInEmail(f.email.value, f.pass.value);
        else {
          await store.signUpEmail(f.elements.name.value.trim(), f.elements.email.value, f.pass.value);
          user = await store.reloadUser(); renderUser();
        }
        go('#/');
      } catch (err) { fail(err); }
    };
  };
  draw();
}

function authMessage(e) {
  const map = {
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'No existe una cuenta con ese correo.',
    'auth/email-already-in-use': 'Ese correo ya está registrado.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/popup-closed-by-user': 'Ventana de Google cerrada.',
    'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase Authentication.',
  };
  return map[e?.code] || e?.message || 'Error al iniciar sesión.';
}

// ───────────────────────── router ─────────────────────────
async function route() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  document.title = CONFIG.siteName;
  window.scrollTo(0, 0);
  try {
    switch (parts[0]) {
      case undefined: return await viewHome();
      case 'n': return await viewNode(parts[1]);
      case 'nuevo': return await viewEditor({ parentId: parts[1] || null });
      case 'editar': return await viewEditor({ id: parts[1] });
      case 'buscar': return await viewSearch(new URLSearchParams(qs).get('q') || '');
      case 'entrar': return viewLogin();
      default: return errorView('Página no encontrada.');
    }
  } catch (e) {
    console.error(e);
    errorView(e.code === 'permission-denied' ? 'Permiso denegado por las reglas de Firestore.' : e.message);
  }
}

// ───────────────────────── arranque ─────────────────────────
(async function boot() {
  document.getElementById('site-name').textContent = CONFIG.siteName;
  loading();
  try {
    store = await createStore();
  } catch (e) {
    return errorView('No se pudo conectar con Firebase: ' + e.message);
  }
  window.addEventListener('hashchange', route);
  let first = true;
  store.onAuth((u) => {
    user = u; authReady = true;
    renderUser();
    if (first) { first = false; route(); }
    else if (!u || !/^#\/(editar|nuevo)/.test(location.hash)) route();
  });
})();
