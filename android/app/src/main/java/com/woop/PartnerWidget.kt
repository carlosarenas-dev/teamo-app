package com.woop

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews

/** Widget de pantalla de inicio: bateria y estado de la pareja de un vistazo. */
class PartnerWidget : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray,
    ) {
        for (id in appWidgetIds) {
            appWidgetManager.updateAppWidget(id, buildViews(context))
        }
    }

    companion object {

        fun updateAll(context: Context) {
            val manager = AppWidgetManager.getInstance(context)
            val ids = manager.getAppWidgetIds(ComponentName(context, PartnerWidget::class.java))
            if (ids.isEmpty()) return
            val views = buildViews(context)
            for (id in ids) manager.updateAppWidget(id, views)
        }

        private fun buildViews(context: Context): RemoteViews {
            val views = RemoteViews(context.packageName, R.layout.widget_partner)

            if (!Prefs.isPaired(context)) {
                views.setTextViewText(R.id.widget_name, context.getString(R.string.app_name))
                views.setTextViewText(R.id.widget_battery, "Sin vincular")
                views.setTextViewText(R.id.widget_status, "")
            } else {
                val partner = Prefs.partner(context)
                views.setTextViewText(R.id.widget_name, partner.label ?: "Tu pareja")
                views.setTextViewText(
                    R.id.widget_battery,
                    buildString {
                        append(partner.battery?.let { "$it%" } ?: "sin bateria")
                        if (partner.charging) append(" en carga")
                        append(" · ")
                        append(TimeAgo.format(partner.batteryAt))
                    },
                )
                views.setTextViewText(
                    R.id.widget_status,
                    partner.level?.let { Levels.describe(it) } ?: "Sin aviso",
                )
            }

            val intent = Intent(context, MainActivity::class.java)
            views.setOnClickPendingIntent(
                R.id.widget_root,
                PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_IMMUTABLE),
            )
            return views
        }
    }
}

/** Al reiniciar el telefono hay que volver a levantar la notificacion de botones. */
class BootReceiver : android.content.BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED &&
            intent.action != Intent.ACTION_MY_PACKAGE_REPLACED
        ) {
            return
        }
        if (!Prefs.isPaired(context)) return

        LockControls.createChannels(context)
        LockControlsService.start(context)
        SyncWorker.schedule(context)
        PartnerWidget.updateAll(context)
    }
}
