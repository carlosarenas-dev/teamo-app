package com.woop

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import androidx.core.content.ContextCompat

/**
 * Los tres ajustes de los que depende que esto funcione de verdad. Si alguno falla, los
 * botones no aparecen en la pantalla de bloqueo o el sistema mata el servicio, asi que
 * la app los comprueba y lleva al sitio exacto en lugar de dar instrucciones sueltas.
 */
object Permissions {

    fun notificationsGranted(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
    }

    /** true = el sistema todavia puede dormir la app y cortar los avisos. */
    fun batteryOptimized(context: Context): Boolean {
        val power = context.getSystemService(PowerManager::class.java) ?: return false
        return !power.isIgnoringBatteryOptimizations(context.packageName)
    }

    /**
     * Si la pantalla de bloqueo oculta el contenido de las notificaciones, los botones
     * no se ven: solo saldria el nombre de la app. Sin esto no hay app.
     */
    fun lockScreenHidesContent(context: Context): Boolean {
        val resolver = context.contentResolver
        val showsNotifications =
            Settings.Secure.getInt(resolver, "lock_screen_show_notifications", 1) == 1
        val showsPrivate =
            Settings.Secure.getInt(resolver, "lock_screen_allow_private_notifications", 1) == 1
        return !(showsNotifications && showsPrivate)
    }

    fun allGood(context: Context): Boolean =
        notificationsGranted(context) && !batteryOptimized(context) && !lockScreenHidesContent(context)

    fun batteryIntent(context: Context): Intent =
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
            .setData(Uri.parse("package:${context.packageName}"))

    fun appNotificationsIntent(context: Context): Intent =
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
            .putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)

    /** Ajustes de notificaciones del sistema, donde vive la opcion de pantalla de bloqueo. */
    fun lockScreenIntent(context: Context): Intent {
        val intent = Intent("android.settings.NOTIFICATION_SETTINGS")
        return if (intent.resolveActivity(context.packageManager) != null) {
            intent
        } else {
            Intent(Settings.ACTION_SETTINGS)
        }
    }
}
