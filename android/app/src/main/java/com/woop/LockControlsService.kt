package com.woop

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/**
 * Mantiene viva la notificacion de los botones.
 *
 * Es un servicio en primer plano por dos motivos: el sistema no mata la notificacion, y
 * nos deja tener registrado el receptor de bateria de forma continua. El tipo
 * `specialUse` es el que corresponde en Android 14+ a algo que no encaja en las
 * categorias existentes.
 */
class LockControlsService : Service() {

    override fun onCreate() {
        super.onCreate()
        LockControls.createChannels(this)
        BatteryWatcher.start(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (!Prefs.isPaired(this)) {
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = LockControls.build(this)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(
                LockControls.NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
            )
        } else {
            startForeground(LockControls.NOTIFICATION_ID, notification)
        }

        return START_STICKY
    }

    override fun onDestroy() {
        BatteryWatcher.stop(this)
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        fun start(context: Context) {
            if (!Prefs.isPaired(context)) return
            val intent = Intent(context, LockControlsService::class.java)
            context.startForegroundService(intent)
        }

        fun stop(context: Context) {
            context.stopService(Intent(context, LockControlsService::class.java))
        }
    }
}
