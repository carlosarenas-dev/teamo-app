package com.woop

import android.Manifest
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.woop.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    /**
     * Mientras se espera a que la pareja escriba el codigo, se pregunta al servidor
     * cada pocos segundos. Se arma/desarma con el ciclo de vida de la Activity para no
     * seguir gastando red con la pantalla en segundo plano.
     */
    private val pollHandler = Handler(Looper.getMainLooper())
    private val pollRunnable = Runnable { loadState() }
    private val waitingPollMs = 3000L

    private val askNotifications =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            if (granted) LockControlsService.start(this)
            renderPermissions()
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        LockControls.createChannels(this)
        wireListeners()
        render()
    }

    override fun onResume() {
        super.onResume()
        render()
        if (Prefs.isPaired(this)) loadState()
    }

    override fun onPause() {
        super.onPause()
        pollHandler.removeCallbacks(pollRunnable)
    }

    // ------------------------------------------------------------------ listeners

    private fun wireListeners() = with(binding) {
        btnGenerate.setOnClickListener { generateCode() }
        btnClaim.setOnClickListener { claimCode() }
        btnPairReset.setOnClickListener { resetPairing() }
        btnSaveName.setOnClickListener { saveName() }
        btnUnpair.setOnClickListener { confirmUnpair() }

        btnPermNotifications.setOnClickListener {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                askNotifications.launch(Manifest.permission.POST_NOTIFICATIONS)
            } else {
                startActivity(Permissions.appNotificationsIntent(this@MainActivity))
            }
        }
        btnPermBattery.setOnClickListener {
            startActivity(Permissions.batteryIntent(this@MainActivity))
        }
        btnPermLockscreen.setOnClickListener {
            startActivity(Permissions.lockScreenIntent(this@MainActivity))
            toast("Activa 'Mostrar todo el contenido de las notificaciones'")
        }

        val signals = listOf(
            b1 to 1, b2 to 2, b3 to 3, b4 to 4, b5 to 5,
        )
        for ((view, level) in signals) {
            view.setOnClickListener { send("status", level) }
        }
        bMiss.setOnClickListener { send("missclick", null) }
        bWoop.setOnClickListener { send("woop", null) }
    }

    // ------------------------------------------------------------------ emparejar

    private fun generateCode() = background(
        work = { Api.pairNew() },
        onSuccess = { (code, token) ->
            Prefs.setToken(this, token)
            Prefs.setPendingCode(this, code)
            Prefs.setLinked(this, false)
            afterPairing()
        },
    )

    private fun claimCode() {
        val code = binding.etCode.text.toString().filter { it.isDigit() }
        if (code.length != 6) {
            toast("El codigo son 6 digitos")
            return
        }
        background(
            work = { Api.pairClaim(code) },
            onSuccess = { token ->
                Prefs.setToken(this, token)
                Prefs.setPendingCode(this, null)
                // Si el claim tuvo exito, el servidor ya empareja los dos slots al
                // instante: no hace falta esperar ni sondear, ya esta vinculado.
                Prefs.setLinked(this, true)
                afterPairing()
            },
        )
    }

    /** Vuelve a la pantalla inicial sin llamar al servidor (el codigo no llego a usarse). */
    private fun resetPairing() {
        pollHandler.removeCallbacks(pollRunnable)
        Unpair.locally(this)
        render()
    }

    /**
     * Tras generar o reclamar un codigo: registrar el token de FCM, levantar la
     * notificacion de botones y programar el refresco periodico. El estado de "ya hay
     * pareja" lo confirma [loadState] contra el servidor, nunca se asume aqui.
     */
    private fun afterPairing() {
        // Registrar SIEMPRE la plataforma, aunque Firebase no este configurado: si solo
        // dependiera del callback del token de FCM, el servidor no sabria que este
        // dispositivo es Android y no podria mandarle nada.
        RegisterWorker.enqueue(this, null)
        RegisterWorker.refreshToken(this)
        LockControlsService.start(this)
        SyncWorker.schedule(this)
        render()
        lifecycleScope.launch {
            withContext(Dispatchers.IO) { BatteryWatcher.reportNow(this@MainActivity, force = true) }
            loadState()
        }
    }

    private fun confirmUnpair() {
        AlertDialog.Builder(this)
            .setTitle("Desvincular")
            .setMessage("Esto rompe el vinculo en los dos telefonos. Seguro?")
            .setNegativeButton("Cancelar", null)
            .setPositiveButton("Desvincular") { _, _ ->
                background(
                    work = { runCatching { Api.unpair(this) } },
                    onSuccess = {
                        Unpair.locally(this)
                        render()
                    },
                )
            }
            .show()
    }

    // ------------------------------------------------------------------ senales

    private fun send(type: String, level: Int?) {
        when (type) {
            "status" -> Prefs.setMyLevel(this, level ?: 0)
            "missclick" -> Prefs.setMyLevel(this, 0)
        }
        LockControls.refresh(this)
        SendSignalWorker.enqueue(this, type, level)
        toast(
            when (type) {
                "status" -> getString(R.string.sent_level, level ?: 0)
                "woop" -> getString(R.string.sent_woop)
                else -> getString(R.string.sent_missclick)
            },
        )
        render()
    }

    private fun saveName() {
        val label = binding.etName.text.toString().trim()
        if (label.isEmpty()) return
        Prefs.setLabel(this, label)
        RegisterWorker.enqueue(this, null)
        render()
        loadState()
    }

    // ------------------------------------------------------------------ pintado

    private fun render() {
        val hasToken = Prefs.isPaired(this)
        if (!hasToken) {
            binding.pairingContainer.visibility = View.VISIBLE
            binding.waitingContainer.visibility = View.GONE
            binding.homeContainer.visibility = View.GONE
            return
        }

        val linked = Prefs.isLinked(this)
        if (!linked) {
            binding.pairingContainer.visibility = View.GONE
            binding.waitingContainer.visibility = View.VISIBLE
            binding.homeContainer.visibility = View.GONE
            binding.tvWaitingCode.text = Prefs.pendingCode(this) ?: "······"
            return
        }

        binding.pairingContainer.visibility = View.GONE
        binding.waitingContainer.visibility = View.GONE
        binding.homeContainer.visibility = View.VISIBLE

        renderPermissions()
        binding.cardName.visibility = if (Prefs.label(this) == null) View.VISIBLE else View.GONE

        val partner = Prefs.partner(this)
        binding.tvPartnerName.text = partner.label ?: "Tu pareja"
        binding.tvPartnerBattery.text = buildString {
            append(partner.battery?.let { "Bateria $it%" } ?: "Bateria sin datos")
            if (partner.charging) append(" en carga")
            append(" · ")
            append(TimeAgo.format(partner.batteryAt))
        }
        binding.tvPartnerStatus.text =
            partner.level?.let { Levels.describe(it) } ?: "Sin aviso"

        binding.tvMyName.text = Prefs.label(this) ?: "Yo"
        val myLevel = Prefs.myLevel(this)
        binding.tvMyStatus.text = if (myLevel > 0) Levels.describe(myLevel) else "Sin aviso"
    }

    private fun renderPermissions() {
        val missingNotifications = !Permissions.notificationsGranted(this)
        val missingBattery = Permissions.batteryOptimized(this)
        val missingLockScreen = Permissions.lockScreenHidesContent(this)
        val anyMissing = missingNotifications || missingBattery || missingLockScreen

        binding.cardPermissions.visibility = if (anyMissing) View.VISIBLE else View.GONE
        binding.btnPermNotifications.visibility = visibility(missingNotifications)
        binding.btnPermBattery.visibility = visibility(missingBattery)
        binding.btnPermLockscreen.visibility = visibility(missingLockScreen)

        binding.tvPermissions.text = when {
            missingLockScreen ->
                "La pantalla de bloqueo esta ocultando el contenido de las notificaciones, " +
                    "asi que los botones no se ven ahi."
            missingNotifications -> "Sin permiso de notificaciones no hay botones ni avisos."
            else -> "El ahorro de bateria puede dormir la app y cortar los avisos."
        }
    }

    private fun visibility(show: Boolean) = if (show) View.VISIBLE else View.GONE

    private fun renderHistory(entries: List<Api.HistoryEntry>) {
        val container: LinearLayout = binding.historyContainer
        container.removeAllViews()

        if (entries.isEmpty()) {
            container.addView(historyLine("Todavia no hay nada.", muted = true))
            return
        }

        val myName = Prefs.label(this) ?: "Yo"
        val partnerName = Prefs.partner(this).label ?: "Tu pareja"

        for (entry in entries.take(20)) {
            val what = when (entry.type) {
                "woop" -> "Woop"
                "missclick" -> "Fue sin querer"
                else -> Levels.describe(entry.level ?: 0)
            }
            val who = if (entry.mine) myName else partnerName
            container.addView(historyLine("$what  ·  $who  ·  ${TimeAgo.format(entry.at)}"))
        }
    }

    private fun historyLine(text: String, muted: Boolean = false): TextView =
        TextView(this).apply {
            this.text = text
            textSize = 14f
            setTextColor(getColor(if (muted) R.color.muted else R.color.text))
            gravity = Gravity.START
            setPadding(0, 10, 0, 10)
        }

    // ------------------------------------------------------------------ red

    private fun loadState() {
        // Por si esta llamada coincide con un sondeo ya programado: solo debe quedar
        // pendiente una copia a la vez.
        pollHandler.removeCallbacks(pollRunnable)

        lifecycleScope.launch {
            val wasLinked = Prefs.isLinked(this@MainActivity)

            val snapshot = withContext(Dispatchers.IO) {
                runCatching { Api.state(this@MainActivity) }.getOrNull()
            }
            if (!Prefs.isPaired(this@MainActivity)) {
                // Sync.refresh (dentro de otros workers) puede haber detectado un 401 y
                // deshecho el vinculo local mientras tanto.
                pollHandler.removeCallbacks(pollRunnable)
                render()
                return@launch
            }
            if (snapshot == null) {
                // Sin red ahora mismo: se reintenta si tocaba seguir esperando.
                if (!wasLinked) pollHandler.postDelayed(pollRunnable, waitingPollMs)
                return@launch
            }

            Prefs.setLinked(this@MainActivity, snapshot.paired)
            val entries = if (snapshot.paired) {
                snapshot.partner?.let { Prefs.savePartner(this@MainActivity, it) }
                Prefs.setMyLevel(this@MainActivity, snapshot.me.level ?: 0)
                LockControls.refresh(this@MainActivity)
                PartnerWidget.updateAll(this@MainActivity)
                withContext(Dispatchers.IO) {
                    runCatching { Api.history(this@MainActivity) }.getOrDefault(emptyList())
                }
            } else {
                emptyList()
            }

            render()
            if (snapshot.paired) renderHistory(entries)

            if (snapshot.paired && !wasLinked) {
                toast("Vinculados")
                vibrate()
            }

            // Mientras se espera a que la pareja escriba el codigo, se vuelve a
            // preguntar solo: es como la app "cambia sola" que promete la pantalla.
            if (!snapshot.paired) {
                pollHandler.postDelayed(pollRunnable, waitingPollMs)
            }
        }
    }

    private fun vibrate() {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            getSystemService(android.os.VibratorManager::class.java)?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(android.os.Vibrator::class.java)
        } ?: return
        vibrator.vibrate(
            android.os.VibrationEffect.createWaveform(longArrayOf(0, 40, 60, 40), -1),
        )
    }

    private fun <T> background(work: () -> T, onSuccess: (T) -> Unit) {
        lifecycleScope.launch {
            val result = withContext(Dispatchers.IO) { runCatching(work) }
            result
                .onSuccess(onSuccess)
                .onFailure { error ->
                    toast((error as? Api.ApiException)?.message ?: "Algo fallo")
                }
        }
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
    }
}
