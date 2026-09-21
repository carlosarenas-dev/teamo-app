# Woop en iPhone — instalación y ajustes

En el iPhone, Woop es una **web app instalada**: se ve y se usa como cualquier otra app
(icono propio, pantalla completa, notificaciones en la pantalla de bloqueo), pero se
instala desde Safari en vez de desde la App Store.

Necesitas **iOS 16.4 o posterior**.

---

## 1. Instalar

> ⚠️ Este paso no se puede saltar. Apple **solo** permite notificaciones a las webs
> que están añadidas a la pantalla de inicio. Si la dejas como pestaña de Safari, no
> llegará ni un aviso.

1. Abre la URL en **Safari** (tiene que ser Safari, no Chrome).
2. Toca el botón **Compartir** (el cuadrado con la flecha hacia arriba).
3. Baja y toca **Añadir a pantalla de inicio**.
4. Toca **Añadir**.
5. Cierra Safari y abre **Woop** desde la pantalla de inicio.

## 2. Activar los avisos

Dentro de la app aparece una tarjeta: **"Falta activar las notificaciones"**. Tócala y
acepta el permiso que pide iOS.

Si ya lo rechazaste antes: *Ajustes → Notificaciones → Woop* y actívalas ahí.

## 3. Vincular

1. Uno de los dos genera el código y se lo dicta al otro.
   - Si te lo dictan: escríbelo en **"Ya tengo un código"** → **Vincular**.
   - Si lo generas tú: **Generar un código** y dicta los 6 números. Caduca a los
     10 minutos.
2. Escribe tu nombre. Es lo que verá la otra persona en cada aviso.

## 4. Que se vea tu batería (opcional, 10 minutos, se hace una vez)

Safari no le deja a ninguna web leer el nivel de batería. Sin este paso, tu porcentaje
solo se actualiza **cuando abres la app**; con él, se actualiza solo cada 10 %.

Se hace con automatizaciones de la app **Atajos**, que ya viene en el iPhone.

### Crear la primera

1. Abre **Atajos** → pestaña **Automatización** → **+**.
2. Busca y elige **Nivel de batería**.
3. Pon el deslizador en **90 %** y marca **Baja del 90 %**.
4. Elige **Ejecutar inmediatamente** y desactiva **Notificar al ejecutarse**
   (si no, te avisará cada vez y es molesto).
5. Toca **Siguiente** → **Nueva acción en blanco**.
6. Busca **Nivel de batería** y añádelo.
7. Busca **Obtener contenido de URL** y añádelo. Ábrelo con la flecha ▸ y configura:
   - **URL**: `https://TU-URL/api/battery`
   - **Método**: `POST`
   - **Encabezados**: añade uno con clave `Authorization` y valor `Bearer TU-TOKEN`
   - **Cuerpo de la solicitud**: `JSON`
     - campo `level` (tipo Número) → valor: la variable **Nivel de batería**
     - campo `charging` (tipo Booleano) → `false`
8. **Listo**.

> **Tu token** sale en la propia app: abre Woop y mira el apartado de ajustes al final.
> Es una cadena larga de letras y números. Trátalo como una contraseña.

### Duplicar para el resto

Mantén pulsada la automatización que acabas de crear → **Duplicar**, y cambia solo el
porcentaje. Hazlo para: **80, 70, 60, 50, 40, 30, 20, 10 y 5 %**.

### Y dos más para el cargador

Igual que las anteriores, pero eligiendo **Cargador** como disparador:
- **Se conecta** → mismo atajo, pero con `charging` en `true`
- **Se desconecta** → mismo atajo, con `charging` en `false`

---

## Cómo se usa

Abre Woop y verás:

- **Arriba**: su batería, desde cuándo, y qué tan ocupada está.
- **En medio**: los 7 botones para avisarle tú.
- **Abajo**: tu batería y el historial.

| Botón | Qué dice |
|---|---|
| **1** | Libre |
| **2** | Algo ocupada |
| **3** | Ocupada |
| **4** | Muy ocupada |
| **5** | No puedo ahora |
| **Sin querer** | Borra el aviso anterior |
| **Woop** | Un toque de cariño |

Sus avisos te llegan a la pantalla de bloqueo aunque tengas la app cerrada.

## Si algo no va

**No me llegan notificaciones.** Casi siempre es que la abriste desde Safari en vez de
desde el icono de la pantalla de inicio. Compruébalo: abierta bien, no se ve la barra
de direcciones de Safari.

**Se me borró la vinculación.** iOS limpia los datos de webs que no se usan en mucho
tiempo. Vuelve a vincular con un código nuevo; abrir la app de vez en cuando lo evita.

**Su batería aparece como "hace 2 h".** Es su teléfono el que no está reportando —
revisa el ahorro de batería en el Android (ver `SETUP-android.md`).

**Mi batería solo cambia cuando abro la app.** Te faltan las automatizaciones de la
sección 4. Es normal y no rompe nada más.
