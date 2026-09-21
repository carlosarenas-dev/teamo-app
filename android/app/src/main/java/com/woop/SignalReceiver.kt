package com.woop

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * Recibe los toques de los botones de la notificacion.
 *
 * Un BroadcastReceiver se ejecuta con el telefono BLOQUEADO, que es justo lo que hace
 * falta. Aqui solo se hacen cosas instantaneas (confirmacion visual + vibracion) y el
 * envio de red se delega a WorkManager, porque un receiver no puede bloquearse.
 */
class SignalReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        Log.i(TAG, "onReceive action=${intent.action}")
        if (intent.action != ACTION_SIGNAL) return
        val type = intent.getStringExtra(EXTRA_TYPE) ?: return
        val level = intent.getIntExtra(EXTRA_LEVEL, 0).takeIf { it in 1..5 }

        val appContext = context.applicationContext
        if (!Prefs.isPaired(appContext)) {
            Log.w(TAG, "Sin vincular: se ignora la senal")
            return
        }
        Log.i(TAG, "senal type=$type level=$level")

        // Estado optimista: el boton se marca ya, sin esperar al servidor.
        when (type) {
            "status" -> Prefs.setMyLevel(appContext, level ?: 0)
            "missclick" -> Prefs.setMyLevel(appContext, 0)
        }

        val feedback = when (type) {
            "status" -> appContext.getString(R.string.sent_level, level ?: 0)
            "woop" -> appContext.getString(R.string.sent_woop)
            else -> appContext.getString(R.string.sent_missclick)
        }
        LockControls.showFeedback(appContext, feedback)
        vibrate(appContext, type)

        SendSignalWorker.enqueue(appContext, type, level)
    }

    private fun vibrate(context: Context, type: String) {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Vibrator::class.java)
        } ?: return

        val effect = if (type == "woop") {
            VibrationEffect.createWaveform(longArrayOf(0, 35, 60, 35), -1)
        } else {
            VibrationEffect.createOneShot(25, VibrationEffect.DEFAULT_AMPLITUDE)
        }
        vibrator.vibrate(effect)
    }

    companion object {
        private const val TAG = "WoopSignal"
        const val ACTION_SIGNAL = "com.woop.action.SIGNAL"
        const val EXTRA_TYPE = "type"
        const val EXTRA_LEVEL = "level"
    }
}
