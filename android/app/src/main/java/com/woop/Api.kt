package com.woop

import android.content.Context
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/**
 * Cliente HTTP del Worker. Usa HttpURLConnection y org.json a proposito: son parte del
 * sistema, asi que la app no arrastra ni Retrofit ni OkHttp para seis peticiones.
 *
 * Todos los metodos BLOQUEAN. Se llaman desde un Worker de WorkManager o desde un hilo
 * de fondo, nunca desde el hilo principal.
 */
object Api {

    class ApiException(val status: Int, val code: String, message: String) : IOException(message)

    data class Snapshot(
        val paired: Boolean,
        val me: PartnerSnapshot,
        val partner: PartnerSnapshot?,
    )

    data class HistoryEntry(val mine: Boolean, val type: String, val level: Int?, val at: Long)

    // ------------------------------------------------------------------ endpoints

    fun pairNew(): Pair<String, String> {
        val response = request("/api/pair/new", "POST", null, auth = null)
        return response.getString("code") to response.getString("token")
    }

    fun pairClaim(code: String): String {
        val body = JSONObject().put("code", code)
        return request("/api/pair/claim", "POST", body, auth = null).getString("token")
    }

    fun register(context: Context, fcmToken: String? = null, label: String? = null) {
        val body = JSONObject().put("platform", "android")
        fcmToken?.let { body.put("fcmToken", it) }
        label?.let { body.put("label", it) }
        request("/api/register", "POST", body, auth = requireToken(context))
    }

    /** @return true si el servidor lo acepto; false si lo descarto por anti-rebote. */
    fun signal(context: Context, type: String, level: Int?): Boolean {
        val body = JSONObject().put("type", type)
        level?.let { body.put("level", it) }
        val response = request("/api/signal", "POST", body, auth = requireToken(context))
        return !response.optBoolean("deduped", false)
    }

    fun battery(context: Context, level: Int, charging: Boolean) {
        val body = JSONObject().put("level", level).put("charging", charging)
        request("/api/battery", "POST", body, auth = requireToken(context))
    }

    fun state(context: Context): Snapshot {
        val response = request("/api/state", "GET", null, auth = requireToken(context))
        return Snapshot(
            paired = response.optBoolean("paired", false),
            me = parseDevice(response.optJSONObject("me")),
            partner = response.optJSONObject("partner")?.let { parseDevice(it) },
        )
    }

    fun history(context: Context): List<HistoryEntry> {
        val response = request("/api/history", "GET", null, auth = requireToken(context))
        val array = response.optJSONArray("events") ?: return emptyList()
        return (0 until array.length()).map { index ->
            val item = array.getJSONObject(index)
            HistoryEntry(
                mine = item.optBoolean("mine"),
                type = item.optString("type"),
                level = item.opt("level")?.takeIf { it != JSONObject.NULL }?.let { (it as Number).toInt() },
                at = item.optLong("at"),
            )
        }
    }

    fun unpair(context: Context) {
        request("/api/unpair", "POST", null, auth = requireToken(context))
    }

    // ------------------------------------------------------------------ internals

    private fun requireToken(context: Context): String =
        Prefs.token(context) ?: throw ApiException(401, "no_token", "Este telefono no esta vinculado")

    private fun parseDevice(json: JSONObject?): PartnerSnapshot {
        if (json == null) return PartnerSnapshot(null, null, false, null, null, null)
        val status = json.optJSONObject("status")
        return PartnerSnapshot(
            label = json.optString("label").takeIf { it.isNotEmpty() && it != "null" },
            battery = if (json.isNull("battery")) null else json.optInt("battery"),
            charging = json.optBoolean("charging", false),
            batteryAt = if (json.isNull("batteryAt")) null else json.optLong("batteryAt"),
            level = status?.optInt("level"),
            statusAt = status?.optLong("at"),
        )
    }

    private fun request(path: String, method: String, body: JSONObject?, auth: String?): JSONObject {
        val connection = URL(BuildConfig.BASE_URL + path).openConnection() as HttpURLConnection
        try {
            connection.requestMethod = method
            connection.connectTimeout = 10_000
            connection.readTimeout = 15_000
            auth?.let { connection.setRequestProperty("Authorization", "Bearer $it") }

            if (body != null) {
                connection.doOutput = true
                connection.setRequestProperty("Content-Type", "application/json")
                connection.outputStream.use { it.write(body.toString().toByteArray()) }
            }

            val status = connection.responseCode
            val text = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            val json = if (text.isBlank()) JSONObject() else JSONObject(text)

            if (status !in 200..299) {
                throw ApiException(
                    status,
                    json.optString("error", "error"),
                    json.optString("message", "Fallo la peticion ($status)"),
                )
            }
            return json
        } finally {
            connection.disconnect()
        }
    }
}
