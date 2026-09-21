import type { HistoryEvent, State } from './api';

export const LEVEL_LABELS: Record<number, string> = {
  1: 'libre',
  2: 'algo ocupada',
  3: 'ocupada',
  4: 'muy ocupada',
  5: 'no puedo ahora',
};

export function relTime(at: number | null, now: number): string {
  if (at == null) return 'sin datos';
  const seconds = Math.max(0, Math.round((now - at) / 1000));
  if (seconds < 45) return 'ahora mismo';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

/** Solo baja a rojo cuando de verdad importa; el resto del tiempo es azul, neutro. */
function batteryColor(level: number): string {
  return level <= 15 ? 'var(--red)' : 'var(--blue)';
}

export function batteryRing(level: number | null, charging: boolean): string {
  if (level == null) {
    return `<div class="ring"><div class="ring-value ring-empty">?</div></div>`;
  }
  const radius = 27;
  const circumference = 2 * Math.PI * radius;
  const filled = (level / 100) * circumference;
  return `
    <div class="ring">
      <svg width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="${radius}" fill="none" stroke="var(--surface-2)" stroke-width="6" />
        <circle cx="32" cy="32" r="${radius}" fill="none" stroke="${batteryColor(level)}"
                stroke-width="6" stroke-linecap="round"
                stroke-dasharray="${filled} ${circumference - filled}" />
      </svg>
      <div class="ring-value">${charging ? '⚡' : ''}${level}<span style="font-size:11px">%</span></div>
    </div>`;
}

export function statusPill(status: State['me']['status']): string {
  if (!status) return `<span class="pill">Sin aviso</span>`;
  return `<span class="pill" data-level="${status.level}">Nivel ${status.level} de 5 · ${LEVEL_LABELS[status.level]}</span>`;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
}

export function historyItem(event: HistoryEvent, now: number, meLabel: string, partnerLabel: string): string {
  const badge =
    event.type === 'woop' ? '💗' : event.type === 'missclick' ? '✕' : String(event.level);
  const text =
    event.type === 'woop'
      ? 'Woop'
      : event.type === 'missclick'
        ? 'Fue sin querer'
        : `Nivel ${event.level} — ${LEVEL_LABELS[event.level!]}`;
  const who = escapeHtml(event.mine ? meLabel : partnerLabel);
  return `<li><span class="badge">${badge}</span><span>${text}</span>
    <span class="who">${who} · ${relTime(event.at, now)}</span></li>`;
}
