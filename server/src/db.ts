import type { Device, Env, EventRow, SignalType } from './types';

export async function getDeviceByToken(env: Env, token: string): Promise<Device | null> {
  return env.DB.prepare('SELECT * FROM devices WHERE token = ?').bind(token).first<Device>();
}

export async function getPartner(env: Env, self: Device): Promise<Device | null> {
  return env.DB.prepare('SELECT * FROM devices WHERE pair_id = ? AND slot != ?')
    .bind(self.pair_id, self.slot)
    .first<Device>();
}

export async function countDevicesInPair(env: Env, pairId: string): Promise<number> {
  const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices WHERE pair_id = ?')
    .bind(pairId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function insertEvent(
  env: Env,
  pairId: string,
  fromSlot: number,
  type: SignalType,
  level: number | null,
  at: number,
): Promise<void> {
  await env.DB.prepare(
    'INSERT INTO events (pair_id, from_slot, type, level, at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(pairId, fromSlot, type, level, at)
    .run();
}

export async function lastEventFrom(
  env: Env,
  pairId: string,
  fromSlot: number,
): Promise<EventRow | null> {
  return env.DB.prepare(
    'SELECT * FROM events WHERE pair_id = ? AND from_slot = ? ORDER BY at DESC LIMIT 1',
  )
    .bind(pairId, fromSlot)
    .first<EventRow>();
}

export async function recentEvents(env: Env, pairId: string, limit = 50): Promise<EventRow[]> {
  const res = await env.DB.prepare(
    'SELECT * FROM events WHERE pair_id = ? ORDER BY at DESC LIMIT ?',
  )
    .bind(pairId, limit)
    .all<EventRow>();
  return res.results ?? [];
}

export async function setStatus(
  env: Env,
  token: string,
  level: number | null,
  at: number | null,
): Promise<void> {
  await env.DB.prepare('UPDATE devices SET status_level = ?, status_at = ? WHERE token = ?')
    .bind(level, at, token)
    .run();
}

export async function setBattery(
  env: Env,
  token: string,
  level: number,
  charging: boolean,
  at: number,
): Promise<void> {
  await env.DB.prepare(
    'UPDATE devices SET battery = ?, charging = ?, battery_at = ? WHERE token = ?',
  )
    .bind(level, charging ? 1 : 0, at, token)
    .run();
}

/** Borra codigos caducados. Barato y se llama en cada intento de emparejamiento. */
export async function purgeExpiredCodes(env: Env, now: number): Promise<void> {
  await env.DB.prepare('DELETE FROM pending_codes WHERE expires_at < ?').bind(now).run();
}

/**
 * Ultimo evento del par. Lo necesita el Service Worker del iPhone: como el push va
 * sin payload, GET /api/state es su unica fuente para saber que notificacion mostrar.
 */
export async function lastEventInPair(env: Env, pairId: string): Promise<EventRow | null> {
  return env.DB.prepare('SELECT * FROM events WHERE pair_id = ? ORDER BY at DESC LIMIT 1')
    .bind(pairId)
    .first<EventRow>();
}
