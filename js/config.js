// ─────────────────────────────────────────────────────────────
//  Configuración del sitio
//  Mientras firebase.apiKey empiece por "TU_", el sitio corre en
//  MODO DEMO: todo se guarda en el localStorage del navegador.
//  La config web de Firebase NO es secreta; se puede subir a git.
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  siteName: 'RestoreGames',
  tagline: 'Restauración de videojuegos, mods y preservación digital',

  // Firebase → Configuración del proyecto → Tus apps → App web
  firebase: {
    apiKey: 'TU_API_KEY',
    authDomain: 'TU_PROYECTO.firebaseapp.com',
    projectId: 'TU_PROYECTO',
    storageBucket: 'TU_PROYECTO.appspot.com',
    messagingSenderId: '000000000000',
    appId: 'TU_APP_ID',
  },

  // Google Cloud → APIs y servicios → Credenciales → ID de cliente OAuth (Aplicación web)
  google: {
    clientId: 'TU_CLIENT_ID.apps.googleusercontent.com',
    // Carpeta que se crea en el Drive de cada usuario que sube archivos
    driveFolderName: 'RestoreGames',
  },
};
