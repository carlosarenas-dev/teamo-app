import { newDeviceToken, newPairId, newPairingCode } from './auth';
import { countDevicesInPair, purgeExpiredCodes } from './db';
import { HttpError } from './http';
import { CODE_TTL_MS, type Env } from './types';

export interface NewPairResult {
  code: string;
  token: string;
  expiresAt: number;
}

/** Crea el par, mete al primer dispositivo en el slot 0 y devuelve el codigo a dictar. */
export async function createPair(env: Env, now: number): Promise<NewPairResult> {
  await purgeExpiredCodes(env, now);

  const pairId = newPairId();
  const token = newDeviceToken();
  const expiresAt = now + CODE_TTL_MS;

  await env.DB.batch([
    env.DB.prepare('INSERT INTO pairs (id, created_at) VALUES (?, ?)').bind(pairId, now),
    env.DB.prepare(
      'INSERT INTO devices (token, pair_id, slot, created_at) VALUES (?, ?, 0, ?)',
    ).bind(token, pairId, now),
  ]);

  // Colision de codigo es improbable (1 entre un millon), pero cuesta poco reintentar.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newPairingCode();
    try {
      await env.DB.prepare(
        'INSERT INTO pending_codes (code, pair_id, expires_at) VALUES (?, ?, ?)',
      )
        .bind(code, pairId, expiresAt)
        .run();
      return { code, token, expiresAt };
    } catch {
      // codigo ya en uso: probamos otro
    }
  }
  throw new HttpError(503, 'code_exhausted', 'No se pudo generar un codigo libre');
}

/** Consume el codigo y mete al segundo dispositivo en el slot 1. */
export async function claimPair(env: Env, code: string, now: number): Promise<{ token: string }> {
  await purgeExpiredCodes(env, now);

  if (!/^\d{6}$/.test(code)) {
    throw new HttpError(400, 'invalid_code', 'El codigo son 6 digitos');
  }

  const pending = await env.DB.prepare(
    'SELECT pair_id, expires_at FROM pending_codes WHERE code = ?',
  )
    .bind(code)
    .first<{ pair_id: string; expires_at: number }>();

  if (!pending) throw new HttpError(404, 'code_not_found', 'Codigo no valido o ya usado');
  if (pending.expires_at < now) {
    throw new HttpError(410, 'code_expired', 'El codigo caduco, genera uno nuevo');
  }
  if ((await countDevicesInPair(env, pending.pair_id)) >= 2) {
    throw new HttpError(409, 'pair_full', 'Ese par ya tiene dos dispositivos');
  }

  const token = newDeviceToken();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO devices (token, pair_id, slot, created_at) VALUES (?, ?, 1, ?)',
    ).bind(token, pending.pair_id, now),
    // El codigo se quema al usarse: un solo uso, sin excepciones.
    env.DB.prepare('DELETE FROM pending_codes WHERE code = ?').bind(code),
  ]);

  return { token };
}
