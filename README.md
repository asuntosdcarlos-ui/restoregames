# RestoreGames

Wiki comunitaria para restauración de videojuegos, mods y preservación.
Los usuarios se registran y escriben páginas organizadas en árbol, sin límite de niveles:

```
Minecraft → Mods → Nombre del mod → (lo que haga falta)
```

- **Sitio estático** (HTML + JS sin compilar) → se aloja gratis en **GitHub Pages**.
- **Usuarios y textos** → **Firebase** (Authentication + Firestore, plan gratuito Spark).
- **Archivos** → **Google Drive de quien los sube**. El sitio solo guarda el enlace, así que no consume espacio tuyo ni del hosting.

Sin configurar nada funciona en **modo demo** (datos en el `localStorage` del navegador) para que puedas probarlo.

## Estructura

```
index.html              página única
css/style.css           estilos
js/config.js            ← lo único que tienes que editar
js/app.js               vistas y router (#/n/<id>, #/nuevo, #/editar, #/buscar, #/entrar)
js/store.js             datos: Firebase o modo demo
js/drive.js             subida a Google Drive (OAuth en el navegador)
firestore.rules         reglas de seguridad de la base de datos
.github/workflows/      despliegue automático a GitHub Pages
```

## Probar en local

```bash
python3 -m http.server 8080
# abre http://localhost:8080
```

(Los módulos ES no funcionan abriendo el archivo con doble clic; hace falta un servidor.)

## 1. Subir a GitHub

```bash
git init -b main          # ya viene hecho si usas el zip
git add . && git commit -m "Primera versión"
git remote add origin https://github.com/TU_USUARIO/restoregames.git
git push -u origin main
```

En GitHub: **Settings → Pages → Source: GitHub Actions**. Cada `push` a `main` publica en
`https://TU_USUARIO.github.io/restoregames/`.

## 2. Firebase (usuarios + contenido)

1. <https://console.firebase.google.com> → **Agregar proyecto**.
2. **Authentication → Método de acceso**: activa **Google** y **Correo/contraseña**.
3. **Authentication → Configuración → Dominios autorizados**: agrega `TU_USUARIO.github.io`.
4. **Firestore Database → Crear base de datos** (modo producción).
5. **Firestore → Reglas**: pega el contenido de `firestore.rules` y publica.
6. **Configuración del proyecto → Tus apps → Web (`</>`)**: copia el objeto `firebaseConfig` a `firebase:` en `js/config.js`.
7. **Hazte admin**: entra una vez al sitio, luego en Firestore abre `users/<tu uid>` y añade el campo `role` = `admin` (string). Solo los admins crean categorías principales (Minecraft, PS1…); cualquier usuario registrado crea subtemas dentro.

## 3. Google Drive (archivos)

Usa el mismo proyecto de Google Cloud que crea Firebase:

1. <https://console.cloud.google.com> → selecciona el proyecto → **APIs y servicios → Biblioteca** → habilita **Google Drive API**.
2. **Pantalla de consentimiento de OAuth**: tipo *Externo*, nombre de la app, tu correo. Añade el permiso `.../auth/drive.file`.
   Es un permiso *no sensible*, así que puedes **publicar** la app sin la verificación larga de Google.
3. **Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web**.
   - Orígenes de JavaScript autorizados: `https://TU_USUARIO.github.io` y `http://localhost:8080`.
4. Copia el ID de cliente en `google.clientId` en `js/config.js`.

Cómo funciona: al pulsar **Subir a mi Drive**, Google pide permiso al usuario, el archivo se sube a una carpeta
`RestoreGames` de **su** Drive (subida reanudable, sirve para archivos grandes) y se comparte como
*cualquiera con el enlace puede ver*. El permiso `drive.file` solo da acceso a archivos que la propia app creó,
nunca al resto del Drive del usuario.
También se puede **pegar un enlace** de Drive (archivo o carpeta) que ya exista.

> Si prefieres que **todo** quede en un único Drive tuyo en vez del de cada usuario, hace falta un pequeño backend
> (p. ej. una Cloud Function con una cuenta de servicio) porque una credencial de servidor no puede vivir en una página estática.

## Permisos

| Acción | Quién |
|---|---|
| Leer | Todo el mundo |
| Crear categoría principal | Admin |
| Crear subtema | Cualquier usuario registrado |
| Editar | Autor, admin, o cualquier registrado si la página tiene *edición abierta* |
| Eliminar | Autor o admin (solo si no tiene subtemas) |

Las reglas de `firestore.rules` imponen esto en el servidor; la interfaz solo oculta botones.

## Notas

- La búsqueda con Firebase compara el **inicio** del título (limitación de Firestore). Para búsqueda de texto completo se puede añadir Algolia o Typesense más adelante.
- Los archivos los aloja cada colaborador; si alguien borra el archivo de su Drive, el enlace deja de funcionar.
- Como administrador del sitio eres responsable de atender reclamaciones de derechos de autor sobre lo que se enlace.
