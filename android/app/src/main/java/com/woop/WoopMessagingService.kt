package com.woop

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.google.firebase.messaging.FirebaseMessaging
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Recibe los avisos de la pareja. El servidor manda mensajes solo-datos para que la
 * notificacion la construyamos aqui: asi elegimos canal, sonido y de paso refrescamos
 * el widget en el mismo golpe.
 */
class WoopMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        RegisterWorker.enqueue(applicationContext, token)
    }

    override fun onMessageReceived(message: RemoteMessage) {
        if (!Prefs.isPaired(applicationContext)) return

        val data = message.data
        val kind = data["kind"] ?: "status"
        val title = data["title"] ?: getString(R.string.app_name)
        val body = data["body"] ?: ""

        LockControls.showIncoming(applicationContext, title, body, kind)

        // El push no trae la bateria; la pedimos para que widget y notificacion cuadren.
        SyncOnceWorker.enqueue(applicationContext)
    }
}

/** Sube el token de FCM (y opcionalmente el nombre) al servidor. */
class RegisterWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        if (!Prefs.isPaired(applicationContext)) return@withContext Result.success()
        try {
            Api.register(
                applicationContext,
                fcmToken = inputData.getString(KEY_FCM_TOKEN),
                label = Prefs.label(applicationContext),
            )
            Result.success()
        } catch (error: Api.ApiException) {
            if (error.status in 400..499) Result.failure() else Result.retry()
        } catch (error: Exception) {
            Result.retry()
        }
    }

    companion object {
        private const val TAG = "WoopRegister"
        private const val KEY_FCM_TOKEN = "fcmToken"

        fun enqueue(context: Context, fcmToken: String?) {
            val request = OneTimeWorkRequestBuilder<RegisterWorker>()
                .setInputData(Data.Builder().putString(KEY_FCM_TOKEN, fcmToken).build())
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
                )
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork("woop-register", ExistingWorkPolicy.REPLACE, request)
        }

        /**
         * Pide el token actual a Firebase y lo registra. Si no hay google-services.json
         * esto falla en silencio y la app sigue funcionando sin push.
         */
        fun refreshToken(context: Context) {
            try {
                FirebaseMessaging.getInstance().token
                    .addOnSuccessListener { token -> enqueue(context, token) }
                    .addOnFailureListener { error ->
                        Log.w(TAG, "Sin token de FCM: ${error.message}")
                    }
            } catch (error: Exception) {
                Log.w(TAG, "Firebase no esta configurado: ${error.message}")
            }
        }
    }
}

/** Un refresco puntual del estado, cuando llega un push. */
class SyncOnceWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        Sync.refresh(applicationContext)
        Result.success()
    }

    companion object {
        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncOnceWorker>()
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
                )
                .build()
            WorkManager.getInstance(context)
                .enqueueUniqueWork("woop-sync-once", ExistingWorkPolicy.REPLACE, request)
        }
    }
}
