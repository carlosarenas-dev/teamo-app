# Woop

Avisos rápidos y batería compartida entre dos personas.

Ella, desde la **pantalla de bloqueo de su Android**, toca un número del **1 al 5** para
decir qué tan ocupada está, **✕** si fue sin querer, o **♥** para mandar un woop. A ti te
llega la notificación al iPhone. Los dos veis el porcentaje de batería del otro.

Emparejamiento con un **código de 6 dígitos**. Sin cuentas, sin contraseñas, sin correos.

---

## Cómo está repartido

| | Android (ella) | iPhone (tú) |
|---|---|---|
| **Qué es** | App nativa Kotlin | PWA instalada en la pantalla de inicio |
| **Los 7 botones** | En la pantalla de bloqueo, **sin desbloquear** | Dentro de la app |
| **Notificaciones** | FCM | Web Push (iOS 16.4+) |
| **Su batería** | En vivo | Con retraso, por automatizaciones de Atajos |

Sin Mac ni cuenta de desarrollador de Apple ($99/año) no se puede instalar una app nativa
en un iPhone. La PWA da lo mismo para este caso —app real, icono propio, push de verdad—
salvo los botones en la pantalla de bloqueo, que en iOS quedan dentro de la app.

**Coste total: 0 €.** Cloudflare Workers, Firebase FCM y Web Push son gratis y ninguno
pide tarjeta.

---

## Estructura

```
woop/
├── server/     Cloudflare Worker + D1. La API y, de paso, sirve la PWA.
├── web/        La PWA del iPhone (TypeScript + Vite, sin framework).
└── android/    La app nativa (Kotlin + Views).
```

---

## Puesta en marcha

### 1. Servidor

```bash
cd server
npm install
npx wrangler login
```

Crea la base de datos y el almacén de claves, y copia los identificadores que imprimen
a `server/wrangler.toml` (`database_id` y el `id` de KV):

```bash
npx wrangler d1 create woop
npx wrangler kv namespace create KV
```

Genera las claves de Web Push. La pública va a `wrangler.toml`; la privada es secreta:

```bash
npm run vapid
npx wrangler secret put VAPID_PRIVATE_KEY
```

> Las claves que vienen en el repo son solo para desarrollo local. **Genera unas nuevas
> antes de desplegar.**

Crea las tablas y despliega:

```bash
cd ../web && npm install && npm run build
cd ../server
npx wrangler d1 execute woop --remote --file=./schema.sql
npx wrangler deploy
```

Apunta la URL que te devuelve. Es la de la PWA y la de la API.

### 2. Firebase (solo para las notificaciones del Android)

1. Crea un proyecto en [console.firebase.google.com](https://console.firebase.google.com)
   (plan Spark, gratis, sin tarjeta).
2. Añade una app Android con el paquete `com.woop` y descarga `google-services.json`
   a `android/app/`.
3. Ajustes del proyecto → Cuentas de servicio → Generar nueva clave privada.
4. Sube ese JSON como secreto:

```bash
npx wrangler secret put FIREBASE_SA_JSON
```

(En PowerShell: `Get-Content clave.json -Raw | npx wrangler secret put FIREBASE_SA_JSON`.)

Sin esto la app Android funciona igual, pero no recibe avisos: solo los manda.

### 3. Android

Pon la URL del servidor en `android/gradle.properties`:

```
woop.baseUrl=https://woop.TU-SUBDOMINIO.workers.dev
```

Y compila e instala:

```bash
cd android
./gradlew installDebug
```

Los pasos que tiene que seguir ella están en [SETUP-android.md](SETUP-android.md).

### 4. iPhone

Abre la URL en Safari y sigue [SETUP-iphone.md](SETUP-iphone.md).

---

## Desarrollo

Servidor y PWA, en dos terminales:

```bash
cd server && npx wrangler dev        # API + PWA ya construida, en :8787
cd web    && npm run dev             # recarga en caliente, en :5173
```

Para que la app Android apunte a tu portátil, en `gradle.properties`:

- Emulador: `woop.baseUrl=http://10.0.2.2:8787`
- Móvil real en la misma wifi: `woop.baseUrl=http://LA-IP-DE-TU-PORTATIL:8787`

Las compilaciones de debug permiten HTTP en claro; las de release, no.

---

## Cómo funciona por dentro

**Los botones en la pantalla de bloqueo (Android).** Android quitó los widgets de la
pantalla de bloqueo en la versión 5. Lo que sí funciona es una notificación *ongoing* con
layout propio (`RemoteViews`), mantenida por un servicio en primer plano. Se usa la vista
**colapsada** a propósito: así los 7 botones se ven enteros sin desplegar nada. Cada botón
apunta a un `BroadcastReceiver`, **no** a una Activity — un receiver se ejecuta con el
teléfono bloqueado, mientras que abrir una Activity obligaría a desbloquear.

**Push al iPhone sin payload.** El Worker manda un push vacío que solo despierta al
Service Worker; este pide `GET /api/state` y construye la notificación con lo que
encuentre. Eso evita por completo el cifrado `aes128gcm` del payload, que es la parte
frágil de Web Push. Cuesta ~200 ms y ahorra una dependencia.

**El token en dos sitios.** En el iPhone, el token del dispositivo se guarda en
`localStorage` *y* en IndexedDB. No es duplicación gratuita: el Service Worker no puede
leer `localStorage`, y necesita el token para pedir el estado cuando llega un push.

**`missclick` corrige, no es un estado más.** Borra el nivel de quien lo pulsa y su
notificación comparte etiqueta con la de nivel, así que **reemplaza** el aviso anterior en
la bandeja en lugar de acumularse.
