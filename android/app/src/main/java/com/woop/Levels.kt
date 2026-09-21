package com.woop

/** Que significa cada numero. Mismo texto que usa el servidor y la PWA. */
object Levels {
    val LABELS = mapOf(
        1 to "libre",
        2 to "algo ocupada",
        3 to "ocupada",
        4 to "muy ocupada",
        5 to "no puedo ahora",
    )

    fun describe(level: Int): String = "Nivel $level de 5 · ${LABELS[level] ?: ""}"
}

object TimeAgo {
    fun format(at: Long?, now: Long = System.currentTimeMillis()): String {
        if (at == null || at <= 0) return "sin datos"
        val seconds = ((now - at) / 1000).coerceAtLeast(0)
        if (seconds < 45) return "ahora mismo"
        val minutes = seconds / 60
        if (minutes < 60) return "hace $minutes min"
        val hours = minutes / 60
        if (hours < 24) return "hace $hours h"
        return "hace ${hours / 24} d"
    }
}
