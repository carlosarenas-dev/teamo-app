package com.woop

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/** Trae el estado del servidor y repinta lo que depende de el. Bloquea. */
object Sync {
    private const val TAG = "WoopSync"

    fun refresh(context: Context): Boolean {
        if (!Prefs.isPaired(context)) return false
        return try {
            val snapshot = Api.state(context)
            Prefs.setLinked(context, snapshot.paired)
            snapshot.partner?.let { Prefs.savePartner(context, it) }
            Prefs.setMyLevel(context, snapshot.me.level ?: 0)
            LockControls.refresh(context)
            PartnerWidget.updateAll(context)
            true
        } catch (error: Api.ApiException) {
            if (error.status == 401) {
                // El otro lado deshizo el vinculo: aqui ya no hay nada que mantener.
                Log.i(TAG, "Token invalido, se deshace el vinculo local")
                Unpair.locally(context)
            }
            false
        } catch (error: Exception) {
            Log.w(TAG, "No se pudo refrescar: ${error.message}")
            false
        }
    }
}

/**
 * Refresco periodico. Los pushes ya avisan de los cambios importantes, pero esto
 * mantiene la bateria de la pareja al dia en el widget aunque no haya pasado nada.
 */
class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        Sync.refresh(applicationContext)
        Result.success()
    }

    companion object {
        private const val NAME = "woop-sync"

        fun schedule(context: Context) {
            val request = PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES)
                .setConstraints(
                    Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build(),
                )
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                NAME,
                ExistingPeriodicWorkPolicy.KEEP,
                request,
            )
        }

        fun cancel(context: Context) {
            WorkManager.getInstance(context).cancelUniqueWork(NAME)
        }
    }
}

object Unpair {
    /** Borra el estado local sin llamar al servidor (ya no serviria de nada). */
    fun locally(context: Context) {
        Prefs.clear(context)
        SyncWorker.cancel(context)
        LockControlsService.stop(context)
        PartnerWidget.updateAll(context)
    }
}
