import { idbDelete, idbSet } from './idb';

const TOKEN_KEY = 'woop.token';

export interface DeviceView {
  label: string | null;
  platform: 'android' | 'web' | null;
  battery: number | null;
  charging: boolean;
  batteryAt: number | null;
  status: { level: number; at: number } | null;
}

export interface State {
  serverTime: number;
  paired: boolean;
  me: DeviceView;
  partner: DeviceView | null;
  lastEvent: { mine: boolean; type: SignalType; level: number | null; at: number } | null;
}

export type SignalType = 'status' | 'woop' | 'missclick';

export interface HistoryEvent {
  id: number;
  mine: boolean;
  type: SignalType;
  level: number | null;
  at: number;
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** El token se guarda dos veces a proposito: localStorage para la pagina, IndexedDB para el SW. */
export async function saveToken(token: string): Promise<void> {
  localStorage.setItem(TOKEN_KEY, token);
  await idbSet('deviceToken', token);
}

export async function clearToken(): Promise<void> {
  localStorage.removeItem(TOKEN_KEY);
  await idbDelete('deviceToken');
}

async function request<T>(path: string, options: RequestInit = {}, auth = true): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set('content-type', 'application/json');
  if (auth) {
    const token = getToken();
    if (!token) throw new ApiError(401, 'no_token', 'Este dispositivo no esta vinculado');
    headers.set('authorization', `Bearer ${token}`);
  }

  const response = await fetch(path, { ...options, headers, cache: 'no-store' });
  const data = (await response.json().catch(() => ({}))) as Record<string, string>;
  if (!response.ok) {
    throw new ApiError(response.status, data.error ?? 'error', data.message ?? 'Fallo la peticion');
  }
  return data as T;
}

export const api = {
  config: () => request<{ vapidPublicKey: string }>('/api/config', {}, false),

  newPair: () =>
    request<{ code: string; token: string; expiresAt: number }>(
      '/api/pair/new',
      { method: 'POST' },
      false,
    ),

  claimPair: (code: string) =>
    request<{ token: string }>(
      '/api/pair/claim',
      { method: 'POST', body: JSON.stringify({ code }) },
      false,
    ),

  register: (body: { platform?: string; label?: string; pushSub?: unknown }) =>
    request<{ ok: true }>('/api/register', { method: 'POST', body: JSON.stringify(body) }),

  signal: (type: SignalType, level?: number) =>
    request<{ ok: true; deduped: boolean }>('/api/signal', {
      method: 'POST',
      body: JSON.stringify(level == null ? { type } : { type, level }),
    }),

  battery: (level: number, charging: boolean) =>
    request<{ ok: true }>('/api/battery', {
      method: 'POST',
      body: JSON.stringify({ level, charging }),
    }),

  state: () => request<State>('/api/state'),

  history: () => request<{ events: HistoryEvent[] }>('/api/history'),

  unpair: () => request<{ ok: true }>('/api/unpair', { method: 'POST' }),
};
