package com.woop

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.util.Log
import java.util.concurrent.Executors

/**
 * Vigila la bateria. En Android esto si es en vivo: ACTION_BATTERY_CHANGED llega cada
 * vez que cambia el porcentaje, asi que la pareja ve el dato casi al instante.
 * (En el iPhone no hay equivalente y por eso alli se usan automatizaciones de Atajos.)
 */
object BatteryWatcher {

    private const val TAG = "WoopBattery"

    /** Aunque no cambie nada, refrescamos de vez en cuando para que no parezca colgado. */
    private const val MAX_SILENCE_MS = 15 * 60 * 1000L

    private val sender = Executors.newSingleThreadExecutor()
    private var receiver: BroadcastReceiver? = null

    fun start(context: Context) {
        if (receiver != null) return
        val appContext = context.applicationContext
        val listener = object : BroadcastReceiver() {
            override fun onReceive(ignored: Context?, intent: Intent) {
                val reading = read(intent) ?: return
                send(appContext, reading, force = false)
            }
        }
        appContext.registerReceiver(listener, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        receiver = listener
    }

    fun stop(context: Context) {
        val listener = receiver ?: return
        runCatching { context.applicationContext.unregisterReceiver(listener) }
        receiver = null
    }

    /** Lee el valor actual del broadcast pegajoso y lo manda si toca. Bloquea. */
    fun reportNow(context: Context, force: Boolean) {
        val intent = context.applicationContext
            .registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return
        val reading = read(intent) ?: return
        push(context.applicationContext, reading, force)
    }

    private data class Reading(val level: Int, val charging: Boolean)

    private fun read(intent: Intent): Reading? {
        val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
        if (level < 0 || scale <= 0) return null

        val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL

        return Reading(level * 100 / scale, charging)
    }

    private fun send(context: Context, reading: Reading, force: Boolean) {
        sender.execute { push(context, reading, force) }
    }

    private fun push(context: Context, reading: Reading, force: Boolean) {
        if (!Prefs.isPaired(context)) return

        val (lastLevel, lastCharging, lastAt) = Prefs.lastBatterySent(context)
        val unchanged = reading.level == lastLevel && reading.charging == lastCharging
        val recent = System.currentTimeMillis() - lastAt < MAX_SILENCE_MS
        if (!force && unchanged && recent) return

        try {
            Api.battery(context, reading.level, reading.charging)
            Prefs.setLastBatterySent(context, reading.level, reading.charging, System.currentTimeMillis())
        } catch (error: Exception) {
            // Sin red ahora mismo. El siguiente cambio de porcentaje lo reintenta solo.
            Log.w(TAG, "No se pudo enviar la bateria: ${error.message}")
        }
    }
}
