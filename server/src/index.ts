import { requireDevice } from './auth';
import { getPartner, lastEventInPair, recentEvents, setBattery } from './db';
import { HttpError, badRequest, json, readJson } from './http';
import { claimPair, createPair } from './pairing';
import { handleSignal, validateSignal } from './signals';
import { BATTERY_DEBOUNCE_MS, STATUS_TTL_MS, type Device, type Env } from './types';

/** Vista publica de un dispositivo: nunca sale el token. */
function deviceView(device: Device | null, now: number) {
  if (!device) return null;
  const statusAlive =
    device.status_level != null &&
    device.status_at != null &&
    now - device.status_at < STATUS_TTL_MS;

  return {
    label: device.label,
    platform: device.platform,
    battery: device.battery,
    charging: device.charging === 1,
    batteryAt: device.battery_at,
    status: statusAlive ? { level: device.status_level, at: device.status_at } : null,
  };
}

async function route(request: Request, env: Env, path: string): Promise<Response> {
  const now = Date.now();
  const method = request.method;

  // --- emparejamiento (sin autenticar: aqui es donde nace el token) ---

  if (path === '/api/pair/new' && method === 'POST') {
    return json(await createPair(env, now));
  }

  if (path === '/api/pair/claim' && method === 'POST') {
    const { code } = await readJson<{ code?: string }>(request);
    if (typeof code !== 'string') badRequest('invalid_code', 'Falta el codigo');
    return json(await claimPair(env, code.trim(), now));
  }

  // La PWA necesita la clave publica VAPID para poder suscribirse al push.
  if (path === '/api/config' && method === 'GET') {
    return json({ vapidPublicKey: env.VAPID_PUBLIC_KEY ?? '' });
  }

  // --- de aqui en adelante hace falta el token del dispositivo ---

  const device = await requireDevice(request, env);

  if (path === '/api/register' && method === 'POST') {
    const body = await readJson<{
      platform?: string;
      label?: string;
      fcmToken?: string;
      pushSub?: unknown;
    }>(request);

    const updates: string[] = [];
    const values: unknown[] = [];
    if (body.platform === 'android' || body.platform === 'web') {
      updates.push('platform = ?');
      values.push(body.platform);
    }
    if (typeof body.label === 'string') {
      updates.push('label = ?');
      values.push(body.label.slice(0, 40));
    }
    if (typeof body.fcmToken === 'string') {
      updates.push('fcm_token = ?');
      values.push(body.fcmToken);
    }
    if (body.pushSub && typeof body.pushSub === 'object') {
      updates.push('push_sub = ?');
      values.push(JSON.stringify(body.pushSub));
    }
    if (updates.length > 0) {
      values.push(device.token);
      await env.DB.prepare(`UPDATE devices SET ${updates.join(', ')} WHERE token = ?`)
        .bind(...values)
        .run();
    }
    return json({ ok: true });
  }

  if (path === '/api/signal' && method === 'POST') {
    const body = await readJson<{ type?: unknown; level?: unknown }>(request);
    const { type, level } = validateSignal(body.type, body.level);
    const result = await handleSignal(env, device, type, level, now);
    return json({ ok: true, ...result });
  }

  if (path === '/api/battery' && method === 'POST') {
    const body = await readJson<{ level?: unknown; charging?: unknown }>(request);
    const level = typeof body.level === 'string' ? Number(body.level) : body.level;
    if (typeof level !== 'number' || !Number.isFinite(level) || level < 0 || level > 100) {
      badRequest('invalid_level', 'level debe ir de 0 a 100');
    }
    const charging = body.charging === true || body.charging === 'true' || body.charging === 1;
    const rounded = Math.round(level);

    // Si no cambio nada y fue hace poco, no tocamos la base: los Atajos del iPhone
    // pueden disparar varias veces seguidas por el mismo umbral.
    const unchanged =
      device.battery === rounded &&
      device.charging === (charging ? 1 : 0) &&
      device.battery_at != null &&
      now - device.battery_at < BATTERY_DEBOUNCE_MS;

    if (!unchanged) await setBattery(env, device.token, rounded, charging, now);
    return json({ ok: true, stored: !unchanged });
  }

  if (path === '/api/state' && method === 'GET') {
    const partner = await getPartner(env, device);
    const last = await lastEventInPair(env, device.pair_id);
    return json({
      serverTime: now,
      paired: partner !== null,
      me: deviceView(device, now),
      partner: deviceView(partner, now),
      lastEvent: last
        ? { mine: last.from_slot === device.slot, type: last.type, level: last.level, at: last.at }
        : null,
    });
  }

  if (path === '/api/history' && method === 'GET') {
    const events = await recentEvents(env, device.pair_id);
    return json({
      events: events.map((event) => ({
        id: event.id,
        mine: event.from_slot === device.slot,
        type: event.type,
        level: event.level,
        at: event.at,
      })),
    });
  }

  if (path === '/api/unpair' && method === 'POST') {
    // Se rompe entero: si solo borraramos un lado, el otro se quedaria con un token
    // que parece valido pero no lleva a ningun sitio.
    await env.DB.batch([
      env.DB.prepare('DELETE FROM events WHERE pair_id = ?').bind(device.pair_id),
      env.DB.prepare('DELETE FROM pending_codes WHERE pair_id = ?').bind(device.pair_id),
      env.DB.prepare('DELETE FROM devices WHERE pair_id = ?').bind(device.pair_id),
      env.DB.prepare('DELETE FROM pairs WHERE id = ?').bind(device.pair_id),
    ]);
    return json({ ok: true });
  }

  throw new HttpError(404, 'not_found', 'Ruta desconocida');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (!path.startsWith('/api/')) {
      return env.ASSETS.fetch(request); // la PWA
    }

    try {
      return await route(request, env, path);
    } catch (error) {
      if (error instanceof HttpError) {
        return json({ error: error.code, message: error.message }, error.status);
      }
      console.error('Error no controlado', error);
      return json({ error: 'internal', message: 'Error interno' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
