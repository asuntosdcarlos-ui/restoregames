// ─────────────────────────────────────────────────────────────
//  Configuración del sitio
//  Mientras firebase.apiKey empiece por "TU_", el sitio corre en
//  MODO DEMO: todo se guarda en el localStorage del navegador.
//  La config web de Firebase NO es secreta; se puede subir a git.
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  siteName: 'RestoreGames',
  tagline: 'Restauración de videojuegos, mods y preservación digital',

  // Cuentas de Google que son administradores (crean categorías principales,
  // editan y borran cualquier página). Si cambias esto, cámbialo también en firestore.rules.
  adminEmails: ['asuntosdcarlos@gmail.com'],

  // Firebase → Configuración del proyecto → Tus apps → App web
  firebase: {
    apiKey: 'AIzaSyCU5OmlZd4S1an1sGLfqh0wgMxTHeAE6u0',
    authDomain: 'restoregames-b66f3.firebaseapp.com',
    projectId: 'restoregames-b66f3',
    storageBucket: 'restoregames-b66f3.firebasestorage.app',
    messagingSenderId: '270564238592',
    appId: '1:270564238592:web:801d197703e17a28adbfe5',
  },

  // Google Cloud → APIs y servicios → Credenciales → ID de cliente OAuth (Aplicación web)
  google: {
    clientId: 'TU_CLIENT_ID.apps.googleusercontent.com',
    // Carpeta que se crea en el Drive de cada usuario que sube archivos
    driveFolderName: 'RestoreGames',
  },
};
