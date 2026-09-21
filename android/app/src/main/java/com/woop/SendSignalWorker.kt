package com.woop

import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.OutOfQuotaPolicy
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Envia la senal al servidor. Va por WorkManager y no por un hilo suelto para que
 * sobreviva si en ese momento no hay cobertura: se reintenta sola cuando vuelva.
 */
class SendSignalWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    /**
     * Obligatorio para el trabajo *expedited* en Android 11 y anteriores: ahi WorkManager
     * lo respalda con un servicio en primer plano, y sin esto descarta la tarea sin avisar.
     * En Android 12+ no llega a mostrarse nada.
     */
    override suspend fun getForegroundInfo(): ForegroundInfo {
        val notification = NotificationCompat.Builder(applicationContext, LockControls.CHANNEL_CONTROLS)
            .setSmallIcon(R.drawable.ic_heart)
            .setContentTitle(applicationContext.getString(R.string.sending))
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .build()

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(SENDING_NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(SENDING_NOTIFICATION_ID, notification)
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val type = inputData.getString(KEY_TYPE) ?: return@withContext Result.failure()
        val level = inputData.getInt(KEY_LEVEL, 0).takeIf { it in 1..5 }

        Log.i(TAG, "enviando type=$type level=$level a ${BuildConfig.BASE_URL}")
        try {
            Api.signal(applicationContext, type, level)
            Log.i(TAG, "enviado")
            // Aprovechamos el viaje para mandar la bateria y refrescar el estado.
            BatteryWatcher.reportNow(applicationContext, force = false)
            Sync.refresh(applicationContext)
            Result.success()
        } catch (error: Api.ApiException) {
            if (error.status == 401) {
                Unpair.locally(applicationContext)
                return@withContext Result.failure()
            }
            // 4xx es culpa nuestra: reintentar no lo va a arreglar.
            if (error.status in 400..499) Result.failure() else Result.retry()
        } catch (error: Exception) {
            Log.w(TAG, "Fallo el envio, se reintentara: ${error.message}")
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "WoopSignal"
        private const val SENDING_NOTIFICATION_ID = 1004
        private const val KEY_TYPE = "type"
        private const val KEY_LEVEL = "level"

        fun enqueue(context: Context, type: String, level: Int?) {
            val data = Data.Builder()
                .putString(KEY_TYPE, type)
                .putInt(KEY_LEVEL, level ?: 0)
                .build()

            val request = OneTimeWorkRequestBuilder<SendSignalWorker>()
                .setInputData(data)
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
                )
                // Expedited: esto es una pulsacion del usuario, no puede esperar a una
                // ventana de mantenimiento del sistema.
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS)
                .build()

            WorkManager.getInstance(context).enqueue(request)
        }
    }
}
