export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  ASSETS: Fetcher;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY: string;
  /** secreto: wrangler secret put VAPID_PRIVATE_KEY */
  VAPID_PRIVATE_KEY?: string;
  /** secreto: wrangler secret put FIREBASE_SA_JSON */
  FIREBASE_SA_JSON?: string;
}

export interface Device {
  token: string;
  pair_id: string;
  slot: number;
  platform: 'android' | 'web' | null;
  label: string | null;
  fcm_token: string | null;
  push_sub: string | null;
  battery: number | null;
  charging: number | null;
  battery_at: number | null;
  status_level: number | null;
  status_at: number | null;
  created_at: number;
}

export interface EventRow {
  id: number;
  pair_id: string;
  from_slot: number;
  type: SignalType;
  level: number | null;
  at: number;
}

export type SignalType = 'status' | 'woop' | 'missclick';

/** Un estado "ocupada nivel N" caduca solo a las 4 h. */
export const STATUS_TTL_MS = 4 * 60 * 60 * 1000;
/** Dos senales identicas seguidas dentro de esta ventana se descartan (bolsillo). */
export const DEDUPE_MS = 3000;
/** No reescribimos la bateria mas seguido que esto si el valor no cambio. */
export const BATTERY_DEBOUNCE_MS = 60_000;
/** Vida de un codigo de emparejamiento. */
export const CODE_TTL_MS = 10 * 60 * 1000;
