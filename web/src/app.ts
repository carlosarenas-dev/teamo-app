import {
  ApiError,
  api,
  clearToken,
  getToken,
  saveToken,
  type HistoryEvent,
  type SignalType,
  type State,
} from './api';
import {
  enablePush,
  isIos,
  isStandalone,
  notificationPermission,
  registerServiceWorker,
  reportBattery,
} from './push';
import { batteryRing, escapeHtml, historyItem, relTime, statusPill } from './ui';

const root = document.getElementById('app')!;
const PENDING_CODE_KEY = 'woop.pendingCode';

let state: State | null = null;
let history: HistoryEvent[] = [];
let timer: number | undefined;
let claiming = false;

// ---------------------------------------------------------------- utilidades

function toast(message: string, kind: 'ok' | 'error' = 'ok'): void {
  document.querySelector('.toast')?.remove();
  const element = document.createElement('div');
  element.className = 'toast';
  element.dataset.kind = kind;
  element.textContent = message;
  document.body.append(element);
  setTimeout(() => element.remove(), 2200);
}

function buzz(pattern: number | number[]): void {
  navigator.vibrate?.(pattern);
}

function setPolling(intervalMs: number | null): void {
  if (timer) clearInterval(timer);
  timer = intervalMs ? window.setInterval(refresh, intervalMs) : undefined;
}

// ---------------------------------------------------------------- pantallas

function pairingScreen(pendingCode: string | null): string {
  if (pendingCode) {
    return `
      <h1>Esperando</h1>
      <p>Dile a tu pareja que escriba este codigo en su telefono. En cuanto lo haga, quedaran vinculados solos.</p>
      <div class="card">
        <div class="code">${pendingCode}</div>
        <p style="text-align:center">Caduca a los 10 minutos.</p>
      </div>
      <button class="btn-ghost" data-action="pair-reset">Empezar de nuevo</button>`;
  }

  return `
    <h1>Teamo</h1>
    <p>Vincula los dos telefonos con un codigo. No hacen falta cuentas ni contrasenas.</p>
    <div class="card">
      <button class="btn-primary" data-action="pair-new">Generar un codigo</button>
    </div>
    <div class="card">
      <label for="code">Ya tengo un codigo</label>
      <input class="code-input" id="code" inputmode="numeric" maxlength="6"
             autocomplete="one-time-code" placeholder="000000" />
      <button class="btn-ghost" style="margin-top:10px" data-action="pair-claim">Vincular</button>
    </div>`;
}

function bannerHtml(): string {
  if (isIos() && !isStandalone()) {
    return `<div class="card banner">
      <strong>Instalala para recibir avisos</strong>
      <p>En Safari toca <b>Compartir</b> y luego <b>Anadir a pantalla de inicio</b>.
      Apple solo permite notificaciones a las webs instaladas asi.</p>
    </div>`;
  }

  const permission = notificationPermission();
  if (permission === 'granted') return '';

  if (permission === 'denied') {
    return `<div class="card banner">
      <strong>Notificaciones bloqueadas</strong>
      <p>Activalas en Ajustes &rarr; Notificaciones &rarr; Teamo, si no, no te llegaran los avisos.</p>
    </div>`;
  }

  return `<div class="card banner">
    <strong>Falta activar las notificaciones</strong>
    <p>Sin esto no te enteras cuando te avise.</p>
    <button class="btn-primary" style="margin-top:10px" data-action="enable-push">Activar avisos</button>
  </div>`;
}

function nameCardHtml(current: string | null): string {
  if (current) return '';
  return `<div class="card banner">
    <strong>Como te llamas?</strong>
    <p>Es el nombre que vera la otra persona en cada aviso.</p>
    <input id="name" maxlength="40" placeholder="Tu nombre" style="margin-top:8px" />
    <button class="btn-primary" style="margin-top:10px" data-action="save-name">Guardar</button>
  </div>`;
}

function homeScreen(current: State): string {
  const now = Date.now();
  const partner = current.partner;
  const meLabel = current.me.label ?? 'Yo';
  const partnerLabel = partner?.label ?? 'Tu pareja';

  const levelButtons = [1, 2, 3, 4, 5]
    .map(
      (level) =>
        `<button data-action="signal" data-type="status" data-level="${level}">${level}</button>`,
    )
    .join('');

  const historyHtml =
    history.length === 0
      ? '<p>Todavia no hay nada.</p>'
      : `<ul class="history">${history
          .slice(0, 20)
          .map((event) => historyItem(event, now, meLabel, partnerLabel))
          .join('')}</ul>`;

  return `
    ${bannerHtml()}
    ${nameCardHtml(current.me.label)}

    <h2>${escapeHtml(partnerLabel)}</h2>
    <div class="card person">
      ${batteryRing(partner?.battery ?? null, partner?.charging ?? false)}
      <div class="person-info">
        <div class="person-name">${escapeHtml(partnerLabel)}</div>
        <div class="person-sub">Bateria ${relTime(partner?.batteryAt ?? null, now)}</div>
        ${statusPill(partner?.status ?? null)}
      </div>
    </div>

    <h2>Avisar</h2>
    <div class="levels">${levelButtons}</div>
    <div class="extras">
      <button data-action="signal" data-type="missclick">Sin querer</button>
      <button class="btn-woop" data-action="signal" data-type="woop">Woop</button>
    </div>

    <h2>Tu</h2>
    <div class="card person">
      ${batteryRing(current.me.battery, current.me.charging)}
      <div class="person-info">
        <div class="person-name">${escapeHtml(meLabel)}</div>
        <div class="person-sub">Bateria ${relTime(current.me.batteryAt, now)}</div>
        ${statusPill(current.me.status)}
      </div>
    </div>

    <h2>Historial</h2>
    <div class="card">${historyHtml}</div>

    <h2>Para las automatizaciones de Atajos</h2>
    <div class="card">
      <p>Estos dos datos son los que pide la guia para que tu bateria se reporte sola.
      Tratalos como una contrasena.</p>
      <label style="margin-top:10px">URL</label>
      <div class="mono">${escapeHtml(location.origin)}/api/battery</div>
      <label style="margin-top:10px">Cabecera Authorization</label>
      <div class="mono" id="token-box">Bearer ${escapeHtml(getToken() ?? '')}</div>
      <button class="btn-ghost" style="margin-top:10px" data-action="copy-token">
        Copiar la cabecera
      </button>
    </div>

    <div class="card">
      <button class="btn-danger" data-action="unpair">Desvincular los dos telefonos</button>
    </div>`;
}

function render(): void {
  if (!getToken()) {
    setPolling(null);
    root.innerHTML = pairingScreen(null);
    return;
  }

  if (state && !state.paired) {
    // Ya tenemos token pero nadie ha reclamado el codigo todavia.
    setPolling(3000);
    root.innerHTML = pairingScreen(localStorage.getItem(PENDING_CODE_KEY));
    return;
  }

  if (!state) {
    root.innerHTML = '<h1>Teamo</h1><p>Cargando...</p>';
    return;
  }

  setPolling(20000);
  root.innerHTML = homeScreen(state);
}

// ---------------------------------------------------------------- datos

async function refresh(): Promise<void> {
  if (!getToken()) return;
  try {
    const next = await api.state();
    const justPaired = state?.paired === false && next.paired;
    state = next;
    if (next.paired) {
      localStorage.removeItem(PENDING_CODE_KEY);
      history = (await api.history()).events;
    }
    render();
    if (justPaired) {
      toast('Vinculados');
      buzz([40, 60, 40]);
    }
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      // El otro lado desvinculo: este token ya no lleva a ningun sitio.
      await clearToken();
      localStorage.removeItem(PENDING_CODE_KEY);
      state = null;
      render();
      toast('Se deshizo el vinculo', 'error');
    }
  }
}

async function afterPairing(token: string): Promise<void> {
  await saveToken(token);
  await api.register({ platform: 'web' }).catch(() => {});
  await reportBattery();
  await refresh();
}

// ---------------------------------------------------------------- acciones

const actions: Record<string, (element: HTMLElement) => Promise<void> | void> = {
  async 'pair-new'() {
    const result = await api.newPair();
    localStorage.setItem(PENDING_CODE_KEY, result.code);
    await afterPairing(result.token);
  },

  async 'pair-claim'() {
    if (claiming) return;
    const input = document.getElementById('code') as HTMLInputElement | null;
    const code = (input?.value ?? '').replace(/\D/g, '');
    if (code.length !== 6) {
      toast('El codigo son 6 digitos', 'error');
      return;
    }
    claiming = true;
    try {
      const { token } = await api.claimPair(code);
      localStorage.removeItem(PENDING_CODE_KEY);
      await afterPairing(token);
      toast('Vinculados');
      buzz([40, 60, 40]);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'No se pudo vincular', 'error');
    } finally {
      claiming = false;
    }
  },

  async 'pair-reset'() {
    await clearToken();
    localStorage.removeItem(PENDING_CODE_KEY);
    state = null;
    render();
  },

  async signal(element) {
    const type = element.dataset.type as SignalType;
    const level = element.dataset.level ? Number(element.dataset.level) : undefined;
    buzz(type === 'woop' ? [30, 50, 30] : 25);
    try {
      const result = await api.signal(type, level);
      toast(result.deduped ? 'Ya estaba enviado' : 'Enviado');
      await reportBattery();
      await refresh();
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'No se pudo enviar', 'error');
    }
  },

  async 'save-name'() {
    const input = document.getElementById('name') as HTMLInputElement | null;
    const label = (input?.value ?? '').trim();
    if (!label) return;
    await api.register({ label });
    await refresh();
  },

  async 'enable-push'() {
    const result = await enablePush();
    const messages: Record<string, string> = {
      ok: 'Avisos activados',
      denied: 'No diste permiso',
      unsupported: 'Este navegador no soporta avisos',
      'needs-install': 'Primero anadela a la pantalla de inicio',
      'not-configured': 'Falta configurar VAPID en el servidor',
    };
    toast(messages[result] ?? result, result === 'ok' ? 'ok' : 'error');
    render();
  },

  async 'copy-token'() {
    const token = getToken();
    if (!token) return;
    const value = `Bearer ${token}`;
    try {
      await navigator.clipboard.writeText(value);
      toast('Copiado');
    } catch {
      // Safari puede bloquear el portapapeles: al menos lo dejamos seleccionado.
      const box = document.getElementById('token-box');
      if (box) {
        const range = document.createRange();
        range.selectNodeContents(box);
        const selection = getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      toast('Seleccionado, copialo a mano', 'error');
    }
  },

  async unpair() {
    if (!confirm('Esto desvincula los dos telefonos. Seguro?')) return;
    await api.unpair().catch(() => {});
    await clearToken();
    localStorage.removeItem(PENDING_CODE_KEY);
    state = null;
    render();
  },
};

root.addEventListener('click', (event) => {
  const element = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!element) return;
  const action = actions[element.dataset.action!];
  if (!action) return;
  event.preventDefault();
  Promise.resolve(action(element)).catch((error) => {
    console.error(error);
    toast(error instanceof ApiError ? error.message : 'Algo fallo', 'error');
  });
});

root.addEventListener('keydown', (event) => {
  if ((event as KeyboardEvent).key !== 'Enter') return;
  const target = event.target as HTMLElement;
  if (target.id === 'code') void actions['pair-claim']!(target);
  if (target.id === 'name') void actions['save-name']!(target);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void refresh();
});

// ---------------------------------------------------------------- arranque

async function boot(): Promise<void> {
  render();
  await registerServiceWorker();
  if (getToken()) {
    await refresh();
    await reportBattery();
  }
}

void boot();
