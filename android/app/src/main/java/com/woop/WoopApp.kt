package com.woop

import android.app.Application

class WoopApp : Application() {
    override fun onCreate() {
        super.onCreate()
        LockControls.createChannels(this)

        // Si ya estaba vinculado, la notificacion de botones tiene que estar ahi desde
        // el primer momento, sin que haga falta abrir la app.
        if (Prefs.isPaired(this)) {
            LockControlsService.start(this)
            SyncWorker.schedule(this)
        }
    }
}
