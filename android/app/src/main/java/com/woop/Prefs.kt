package com.woop

import android.content.Context

/**
 * Estado local: el token del dispositivo y una copia del ultimo estado conocido de la
 * pareja. La copia existe para que el widget y la notificacion puedan pintarse al
 * instante, sin esperar a la red.
 *
 * El token va en SharedPreferences normales a proposito: son privadas de la app y el
 * sandbox de Android ya las protege. EncryptedSharedPreferences anadiria una
 * dependencia en alpha a cambio de casi nada en un telefono sin rootear.
 */
object Prefs {
    private const val FILE = "woop"

    private const val KEY_TOKEN = "token"
    private const val KEY_PENDING_CODE = "pendingCode"
    private const val KEY_LINKED = "linked"
    private const val KEY_LABEL = "label"
    private const val KEY_PARTNER_LABEL = "partnerLabel"
    private const val KEY_PARTNER_BATTERY = "partnerBattery"
    private const val KEY_PARTNER_CHARGING = "partnerCharging"
    private const val KEY_PARTNER_BATTERY_AT = "partnerBatteryAt"
    private const val KEY_PARTNER_LEVEL = "partnerLevel"
    private const val KEY_PARTNER_STATUS_AT = "partnerStatusAt"
    private const val KEY_MY_LEVEL = "myLevel"
    private const val KEY_LAST_BATTERY = "lastBattery"
    private const val KEY_LAST_CHARGING = "lastCharging"
    private const val KEY_LAST_BATTERY_SENT = "lastBatterySent"

    private fun prefs(context: Context) =
        context.applicationContext.getSharedPreferences(FILE, Context.MODE_PRIVATE)

    fun token(context: Context): String? = prefs(context).getString(KEY_TOKEN, null)

    fun setToken(context: Context, value: String?) {
        prefs(context).edit().putString(KEY_TOKEN, value).apply()
    }

    /** Tiene credenciales para hablar con el servidor. NO implica que ya haya pareja. */
    fun isPaired(context: Context): Boolean = token(context) != null

    /** El codigo recien generado, mientras se espera a que el otro telefono lo escriba. */
    fun pendingCode(context: Context): String? = prefs(context).getString(KEY_PENDING_CODE, null)

    fun setPendingCode(context: Context, code: String?) {
        prefs(context).edit().putString(KEY_PENDING_CODE, code).apply()
    }

    /**
     * true solo cuando el servidor confirmo que YA hay alguien en el otro slot del par.
     * Distinto de [isPaired]: se puede tener token (isPaired) sin que la pareja se haya
     * unido todavia (linked). Sin esta distincion, la pantalla saltaba a "inicio" en
     * cuanto se generaba el codigo, antes de que nadie lo hubiera escrito.
     */
    fun isLinked(context: Context): Boolean = prefs(context).getBoolean(KEY_LINKED, false)

    fun setLinked(context: Context, value: Boolean) {
        prefs(context).edit().putBoolean(KEY_LINKED, value).apply()
    }

    fun label(context: Context): String? = prefs(context).getString(KEY_LABEL, null)

    fun setLabel(context: Context, value: String?) {
        prefs(context).edit().putString(KEY_LABEL, value).apply()
    }

    /** Nivel que YO tengo puesto ahora mismo, para resaltarlo en la notificacion. */
    fun myLevel(context: Context): Int = prefs(context).getInt(KEY_MY_LEVEL, 0)

    fun setMyLevel(context: Context, level: Int) {
        prefs(context).edit().putInt(KEY_MY_LEVEL, level).apply()
    }

    fun partner(context: Context): PartnerSnapshot {
        val p = prefs(context)
        return PartnerSnapshot(
            label = p.getString(KEY_PARTNER_LABEL, null),
            battery = p.getInt(KEY_PARTNER_BATTERY, -1).takeIf { it >= 0 },
            charging = p.getBoolean(KEY_PARTNER_CHARGING, false),
            batteryAt = p.getLong(KEY_PARTNER_BATTERY_AT, 0L).takeIf { it > 0 },
            level = p.getInt(KEY_PARTNER_LEVEL, 0).takeIf { it > 0 },
            statusAt = p.getLong(KEY_PARTNER_STATUS_AT, 0L).takeIf { it > 0 },
        )
    }

    fun savePartner(context: Context, snapshot: PartnerSnapshot) {
        prefs(context).edit()
            .putString(KEY_PARTNER_LABEL, snapshot.label)
            .putInt(KEY_PARTNER_BATTERY, snapshot.battery ?: -1)
            .putBoolean(KEY_PARTNER_CHARGING, snapshot.charging)
            .putLong(KEY_PARTNER_BATTERY_AT, snapshot.batteryAt ?: 0L)
            .putInt(KEY_PARTNER_LEVEL, snapshot.level ?: 0)
            .putLong(KEY_PARTNER_STATUS_AT, snapshot.statusAt ?: 0L)
            .apply()
    }

    /** Ultimo porcentaje que llegamos a enviar, para no repetir peticiones identicas. */
    fun lastBatterySent(context: Context): Triple<Int, Boolean, Long> {
        val p = prefs(context)
        return Triple(
            p.getInt(KEY_LAST_BATTERY, -1),
            p.getBoolean(KEY_LAST_CHARGING, false),
            p.getLong(KEY_LAST_BATTERY_SENT, 0L),
        )
    }

    fun setLastBatterySent(context: Context, level: Int, charging: Boolean, at: Long) {
        prefs(context).edit()
            .putInt(KEY_LAST_BATTERY, level)
            .putBoolean(KEY_LAST_CHARGING, charging)
            .putLong(KEY_LAST_BATTERY_SENT, at)
            .apply()
    }

    fun clear(context: Context) {
        prefs(context).edit().clear().apply()
    }
}

data class PartnerSnapshot(
    val label: String?,
    val battery: Int?,
    val charging: Boolean,
    val batteryAt: Long?,
    val level: Int?,
    val statusAt: Long?,
)
