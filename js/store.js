// Capa de datos: Firebase (Auth + Firestore) o modo demo en localStorage.
// Ambas implementaciones exponen la misma API.
import { CONFIG } from './config.js';

const FB_VERSION = '10.12.2';
const FB_BASE = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

export const isDemo = !CONFIG.firebase?.apiKey || CONFIG.firebase.apiKey.startsWith('TU_');

export function createStore() {
  return isDemo ? createLocalStore() : createFirebaseStore();
}

const lower = (s) => (s || '').trim().toLowerCase();
const byTitle = (arr) => arr.sort((a, b) => a.titleLower.localeCompare(b.titleLower, 'es'));

function cleanFiles(files) {
  return (files || []).map((f) => ({
    id: String(f.id || ''),
    name: String(f.name || 'archivo'),
    mimeType: String(f.mimeType || ''),
    size: Number(f.size) || 0,
    view: String(f.view || ''),
    download: String(f.download || ''),
    folder: !!f.folder,
  }));
}

function buildNode(data, user, parent) {
  return {
    title: data.title.trim(),
    titleLower: lower(data.title),
    icon: (data.icon || '').trim().slice(0, 4),
    content: data.content || '',
    files: cleanFiles(data.files),
    openEdit: !!data.openEdit,
    parentId: parent ? parent.id : null,
    ancestors: parent ? [...(parent.ancestors || []), parent.id] : [],
    authorId: user.uid,
    authorName: user.name,
    updatedByName: user.name,
  };
}

function buildPatch(data, user) {
  const p = { updatedByName: user.name };
  if (data.title !== undefined) { p.title = data.title.trim(); p.titleLower = lower(data.title); }
  if (data.icon !== undefined) p.icon = (data.icon || '').trim().slice(0, 4);
  if (data.content !== undefined) p.content = data.content;
  if (data.files !== undefined) p.files = cleanFiles(data.files);
  if (data.openEdit !== undefined) p.openEdit = !!data.openEdit;
  return p;
}

// ═════════════════════════ FIREBASE ═════════════════════════
async function createFirebaseStore() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`${FB_BASE}/firebase-app.js`),
    import(`${FB_BASE}/firebase-auth.js`),
    import(`${FB_BASE}/firebase-firestore.js`),
  ]);
  const app = initializeApp(CONFIG.firebase);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const nodesCol = F.collection(db, 'nodes');

  const ms = (v) => (v && v.toMillis ? v.toMillis() : v || Date.now());
  const toNode = (snap) => {
    if (!snap.exists()) return null;
    const d = snap.data();
    return { id: snap.id, ...d, createdAt: ms(d.createdAt), updatedAt: ms(d.updatedAt) };
  };

  async function loadProfile(u) {
    if (!u) return null;
    const ref = F.doc(db, 'users', u.uid);
    let snap = await F.getDoc(ref);
    if (!snap.exists()) {
      await F.setDoc(ref, {
        name: u.displayName || (u.email || 'usuario').split('@')[0],
        createdAt: F.serverTimestamp(),
      });
      snap = await F.getDoc(ref);
    }
    const d = snap.data();
    return { uid: u.uid, name: d.name, email: u.email, photo: u.photoURL, isAdmin: d.role === 'admin' };
  }

  async function getNode(id) {
    return toNode(await F.getDoc(F.doc(db, 'nodes', id)));
  }

  return {
    mode: 'firebase',
    onAuth: (cb) => A.onAuthStateChanged(auth, async (u) => cb(await loadProfile(u))),
    reloadUser: () => loadProfile(auth.currentUser),
    signInGoogle: () => A.signInWithPopup(auth, new A.GoogleAuthProvider()),
    signInEmail: (email, pass) => A.signInWithEmailAndPassword(auth, email, pass),
    async signUpEmail(name, email, pass) {
      const cred = await A.createUserWithEmailAndPassword(auth, email, pass);
      await A.updateProfile(cred.user, { displayName: name });
      await F.setDoc(F.doc(db, 'users', cred.user.uid), { name, createdAt: F.serverTimestamp() }, { merge: true });
    },
    signOut: () => A.signOut(auth),

    getNode,
    async getChildren(parentId) {
      const snap = await F.getDocs(F.query(nodesCol, F.where('parentId', '==', parentId ?? null)));
      return byTitle(snap.docs.map(toNode));
    },
    async recent(n = 8) {
      const snap = await F.getDocs(F.query(nodesCol, F.orderBy('updatedAt', 'desc'), F.limit(n)));
      return snap.docs.map(toNode);
    },
    async search(q) {
      const s = lower(q);
      if (!s) return [];
      const snap = await F.getDocs(F.query(nodesCol,
        F.where('titleLower', '>=', s), F.where('titleLower', '<=', s + ''), F.limit(30)));
      return snap.docs.map(toNode);
    },
    async createNode(data, user) {
      const parent = data.parentId ? await getNode(data.parentId) : null;
      const doc = { ...buildNode(data, user, parent), createdAt: F.serverTimestamp(), updatedAt: F.serverTimestamp() };
      const ref = await F.addDoc(nodesCol, doc);
      return ref.id;
    },
    async updateNode(id, data, user) {
      await F.updateDoc(F.doc(db, 'nodes', id), { ...buildPatch(data, user), updatedAt: F.serverTimestamp() });
    },
    async deleteNode(id) {
      const kids = await F.getDocs(F.query(nodesCol, F.where('parentId', '==', id), F.limit(1)));
      if (!kids.empty) throw new Error('Primero elimina o mueve los subtemas de esta página.');
      await F.deleteDoc(F.doc(db, 'nodes', id));
    },
  };
}

// ═════════════════════════ MODO DEMO ═════════════════════════
function createLocalStore() {
  const KEY = 'rr_demo_db';
  const SESSION = 'rr_demo_session';
  let listeners = [];

  const load = () => {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && d.nodes) return d; } catch { /* vacío */ }
    return seed();
  };
  const save = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  const uid = () => Math.random().toString(36).slice(2, 12);
  const current = () => { try { return JSON.parse(localStorage.getItem(SESSION)); } catch { return null; } };
  const emit = () => listeners.forEach((cb) => cb(current()));
  const delay = (v) => new Promise((r) => setTimeout(() => r(v), 60));

  function seed() {
    const now = Date.now();
    const author = { uid: 'demo-admin', name: 'Admin demo' };
    const d = { nodes: {} };
    const add = (id, data, parent) => {
      d.nodes[id] = { id, ...buildNode(data, author, parent), createdAt: now, updatedAt: now };
      return d.nodes[id];
    };
    const mc = add('minecraft', { title: 'Minecraft', icon: '🧱',
      content: 'Todo lo relacionado con la restauración y preservación de **Minecraft**: versiones antiguas, mods abandonados, mapas y herramientas.' });
    const mods = add('mc-mods', { title: 'Mods', icon: '🧩',
      content: 'Mods clásicos que ya no están disponibles o que necesitan ser portados a versiones nuevas.' }, mc);
    add('mc-mod-ejemplo', { title: 'Mod de ejemplo', icon: '⚙️', openEdit: true,
      content: [
        '## Descripción', 'Esta es una página de ejemplo. Aquí iría toda la información del mod en concreto.', '',
        '## Versiones', '| Versión del mod | Minecraft | Loader |', '|---|---|---|', '| 1.0.0 | 1.7.10 | Forge |', '',
        '## Instalación', '1. Instala el loader correspondiente.', '2. Descarga el archivo desde la sección **Archivos**.', '3. Cópialo a la carpeta `mods/`.', '',
        '> Los archivos se alojan en Google Drive, no en este sitio.',
      ].join('\n') }, mods);
    add('mc-versiones', { title: 'Versiones antiguas', icon: '📦', content: 'Alpha, Beta e Indev.' }, mc);
    add('ps1', { title: 'PlayStation 1', icon: '🎮', content: 'Parches de traducción, restauración de contenido cortado y documentación.' });
    add('herramientas', { title: 'Herramientas', icon: '🛠️', content: 'Utilidades de ingeniería inversa, extractores y editores.' });
    save(d);
    return d;
  }

  return Promise.resolve({
    mode: 'demo',
    onAuth(cb) { listeners.push(cb); cb(current()); return () => { listeners = listeners.filter((l) => l !== cb); }; },
    reloadUser: async () => current(),
    async signInDemo(name) {
      localStorage.setItem(SESSION, JSON.stringify({ uid: 'demo-' + lower(name).replace(/\W+/g, '-'), name, email: '', isAdmin: true }));
      emit();
    },
    signInGoogle: async () => { throw new Error('En modo demo usa el acceso de demostración.'); },
    signInEmail: async () => { throw new Error('En modo demo usa el acceso de demostración.'); },
    signUpEmail: async () => { throw new Error('En modo demo usa el acceso de demostración.'); },
    async signOut() { localStorage.removeItem(SESSION); emit(); },

    getNode: async (id) => delay(load().nodes[id] || null),
    getChildren: async (pid) => delay(byTitle(Object.values(load().nodes).filter((n) => n.parentId === (pid ?? null)))),
    recent: async (n = 8) => delay(Object.values(load().nodes).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, n)),
    search: async (q) => {
      const s = lower(q);
      return delay(s ? Object.values(load().nodes).filter((n) => n.titleLower.includes(s)).slice(0, 30) : []);
    },
    async createNode(data, user) {
      const d = load();
      const parent = data.parentId ? d.nodes[data.parentId] : null;
      const id = uid();
      d.nodes[id] = { id, ...buildNode(data, user, parent), createdAt: Date.now(), updatedAt: Date.now() };
      save(d);
      return delay(id);
    },
    async updateNode(id, data, user) {
      const d = load();
      if (!d.nodes[id]) throw new Error('La página no existe.');
      Object.assign(d.nodes[id], buildPatch(data, user), { updatedAt: Date.now() });
      save(d);
      return delay();
    },
    async deleteNode(id) {
      const d = load();
      if (Object.values(d.nodes).some((n) => n.parentId === id)) throw new Error('Primero elimina o mueve los subtemas de esta página.');
      delete d.nodes[id];
      save(d);
      return delay();
    },
    resetDemo() { localStorage.removeItem(KEY); },
  });
}
