package com.woop

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * La notificacion fija con los 7 botones.
 *
 * Por que una notificacion y no un widget: Android quito los widgets de la pantalla de
 * bloqueo en la version 5 y no han vuelto de forma fiable. Una notificacion *ongoing*
 * con layout propio si se ve ahi, en todas las versiones.
 *
 * Se usa la vista COLAPSADA (setCustomContentView) a proposito: asi los botones se ven
 * enteros sin tener que desplegar nada. El sistema da unos 64 dp de alto, que es justo
 * lo que ocupa una fila de 7 botones de 46 dp.
 */
object LockControls {

    const val CHANNEL_CONTROLS = "woop.controls"
    const val CHANNEL_STATUS = "woop.status"
    const val CHANNEL_WOOP = "woop.woop"

    const val NOTIFICATION_ID = 1001
    private const val INCOMING_STATUS_ID = 1002
    private const val INCOMING_WOOP_ID = 1003

    private const val FEEDBACK_MS = 2500L

    private val mainHandler = Handler(Looper.getMainLooper())

    private val buttons = listOf(
        Button(R.id.btn_1, "status", 1),
        Button(R.id.btn_2, "status", 2),
        Button(R.id.btn_3, "status", 3),
        Button(R.id.btn_4, "status", 4),
        Button(R.id.btn_5, "status", 5),
        Button(R.id.btn_miss, "missclick", null),
        Button(R.id.btn_woop, "woop", null),
    )

    private data class Button(val viewId: Int, val type: String, val level: Int?)

    // ------------------------------------------------------------------ canales

    fun createChannels(context: Context) {
        val manager = context.getSystemService(NotificationManager::class.java) ?: return

        val controls = NotificationChannel(
            CHANNEL_CONTROLS,
            context.getString(R.string.channel_controls),
            NotificationManager.IMPORTANCE_LOW, // sin sonido: esta ahi siempre
        ).apply {
            description = context.getString(R.string.channel_controls_desc)
            setShowBadge(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }

        val status = NotificationChannel(
            CHANNEL_STATUS,
            context.getString(R.string.channel_status),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.channel_status_desc)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            enableVibration(true)
        }

        val woop = NotificationChannel(
            CHANNEL_WOOP,
            context.getString(R.string.channel_woop),
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = context.getString(R.string.channel_woop_desc)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            enableVibration(true)
            vibrationPattern = longArrayOf(0, 60, 80, 60)
        }

        manager.createNotificationChannels(listOf(controls, status, woop))
    }

    // ------------------------------------------------------- notificacion de botones

    /**
     * El PendingIntent va a un BroadcastReceiver, NO a una Activity. Esa es la clave de
     * que funcione con el telefono bloqueado: abrir una Activity obligaria a desbloquear,
     * mientras que un broadcast se ejecuta tal cual.
     */
    private fun pendingIntentFor(context: Context, button: Button): PendingIntent {
        val intent = Intent(context, SignalReceiver::class.java).apply {
            action = SignalReceiver.ACTION_SIGNAL
            // Un data distinto por boton para que el sistema no reutilice un
            // PendingIntent con los extras de otro.
            data = Uri.parse("woop://signal/${button.type}/${button.level ?: 0}")
            putExtra(SignalReceiver.EXTRA_TYPE, button.type)
            button.level?.let { putExtra(SignalReceiver.EXTRA_LEVEL, it) }
        }
        return PendingIntent.getBroadcast(
            context,
            button.viewId,
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
    }

    private fun wire(context: Context, views: RemoteViews, selectedLevel: Int) {
        for (button in buttons) {
            views.setOnClickPendingIntent(button.viewId, pendingIntentFor(context, button))

            // El nivel que esta puesto ahora mismo se rellena en blanco para verlo de un
            // vistazo sin abrir nada.
            if (button.type == "status") {
                val selected = button.level == selectedLevel
                views.setInt(
                    button.viewId,
                    "setBackgroundResource",
                    if (selected) R.drawable.bg_btn_selected else backgroundFor(button.level!!),
                )
                if (selected) views.setTextColor(button.viewId, 0xFFFFFFFF.toInt())
            }
        }
    }

    private fun backgroundFor(level: Int): Int = when (level) {
        1, 2 -> R.drawable.bg_btn_low
        // El nivel del medio se queda neutro a proposito: solo los extremos llevan color.
        3 -> R.drawable.bg_btn_neutral
        else -> R.drawable.bg_btn_high
    }

    private fun openAppIntent(context: Context): PendingIntent {
        val intent = Intent(context, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE)
    }

    fun build(context: Context, feedback: String? = null): Notification {
        val selectedLevel = Prefs.myLevel(context)

        val collapsed = if (feedback != null) {
            RemoteViews(context.packageName, R.layout.notif_feedback).apply {
                setTextViewText(R.id.tv_feedback, feedback)
            }
        } else {
            RemoteViews(context.packageName, R.layout.notif_controls).also {
                wire(context, it, selectedLevel)
            }
        }

        val expanded = RemoteViews(context.packageName, R.layout.notif_controls_big).apply {
            wire(context, this, selectedLevel)
            setTextViewText(R.id.tv_partner, partnerLine(context))
        }

        return NotificationCompat.Builder(context, CHANNEL_CONTROLS)
            .setSmallIcon(R.drawable.ic_heart)
            .setContentTitle(context.getString(R.string.notif_controls_title))
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            // Sin esto el contenido se oculta en la pantalla de bloqueo y no habria botones.
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCustomContentView(collapsed)
            .setCustomBigContentView(expanded)
            .setContentIntent(openAppIntent(context))
            .build()
    }

    private fun partnerLine(context: Context): String {
        val partner = Prefs.partner(context)
        val name = partner.label ?: "Tu pareja"
        val battery = partner.battery?.let { "$it%" } ?: "sin bateria"
        val status = partner.level?.let { Levels.describe(it) } ?: "sin aviso"
        return "$name · $battery · $status · ${TimeAgo.format(partner.batteryAt)}"
    }

    @SuppressLint("MissingPermission")
    fun refresh(context: Context) {
        if (!Prefs.isPaired(context)) return
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, build(context))
    }

    /** Confirma el envio ocupando el sitio de los botones unos segundos. */
    @SuppressLint("MissingPermission")
    fun showFeedback(context: Context, text: String) {
        val applicationContext = context.applicationContext
        NotificationManagerCompat.from(applicationContext)
            .notify(NOTIFICATION_ID, build(applicationContext, text))

        mainHandler.removeCallbacksAndMessages(null)
        mainHandler.postDelayed({ refresh(applicationContext) }, FEEDBACK_MS)
    }

    // ------------------------------------------------------- notificaciones entrantes

    @SuppressLint("MissingPermission")
    fun showIncoming(context: Context, title: String, body: String, kind: String) {
        val isWoop = kind == "woop"
        val notification = NotificationCompat.Builder(
            context,
            if (isWoop) CHANNEL_WOOP else CHANNEL_STATUS,
        )
            .setSmallIcon(R.drawable.ic_heart)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setContentIntent(openAppIntent(context))
            .build()

        // Los avisos de nivel comparten id: un 'missclick' reemplaza al nivel anterior
        // en vez de acumularse. El woop tiene el suyo para que no se pisen.
        NotificationManagerCompat.from(context)
            .notify(if (isWoop) INCOMING_WOOP_ID else INCOMING_STATUS_ID, notification)
    }

    fun cancelIncomingStatus(context: Context) {
        NotificationManagerCompat.from(context).cancel(INCOMING_STATUS_ID)
    }

    @Suppress("unused")
    fun supportsChannels(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
}
