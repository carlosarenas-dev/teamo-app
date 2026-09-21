import { getPartner, insertEvent, lastEventFrom, setStatus } from './db';
import { badRequest } from './http';
import { sendPush, type PushMessage, type PushResult } from './push';
import { DEDUPE_MS, type Device, type Env, type SignalType } from './types';

/** Que significa cada numero. 1 = libre, 5 = no puedo. */
export const LEVEL_LABELS: Record<number, string> = {
  1: 'libre',
  2: 'algo ocupada',
  3: 'ocupada',
  4: 'muy ocupada',
  5: 'no puedo ahora',
};

function buildMessage(sender: Device, type: SignalType, level: number | null): PushMessage {
  const who = sender.label?.trim() || 'Tu pareja';

  if (type === 'woop') {
    return {
      title: 'Woop',
      body: `${who} te manda un woop`,
      tag: 'woop',
      kind: 'woop',
      data: { type, level: '' },
    };
  }

  if (type === 'missclick') {
    // Comparte tag con 'status' a proposito: reemplaza el aviso anterior en la bandeja
    // en vez de acumularse. Un missclick corrige, no es un estado mas.
    return {
      title: who,
      body: 'Fue sin querer — ignora el aviso anterior',
      tag: 'status',
      kind: 'missclick',
      data: { type, level: '' },
    };
  }

  return {
    title: who,
    body: `Nivel ${level} de 5 — ${LEVEL_LABELS[level!]}`,
    tag: 'status',
    kind: 'status',
    data: { type, level: String(level) },
  };
}

export function validateSignal(type: unknown, level: unknown): { type: SignalType; level: number | null } {
  if (type !== 'status' && type !== 'woop' && type !== 'missclick') {
    badRequest('invalid_type', "type debe ser 'status', 'woop' o 'missclick'");
  }
  if (type !== 'status') return { type, level: null };

  if (typeof level !== 'number' || !Number.isInteger(level) || level < 1 || level > 5) {
    badRequest('invalid_level', 'level debe ser un entero de 1 a 5');
  }
  return { type, level };
}

export async function handleSignal(
  env: Env,
  sender: Device,
  type: SignalType,
  level: number | null,
  now: number,
): Promise<{ deduped: boolean; push: PushResult }> {
  // Anti-rebote: el telefono en el bolsillo o un doble toque no deben valer por dos.
  const previous = await lastEventFrom(env, sender.pair_id, sender.slot);
  if (previous && previous.type === type && previous.level === level && now - previous.at < DEDUPE_MS) {
    return { deduped: true, push: 'no-target' };
  }

  if (type === 'status') await setStatus(env, sender.token, level, now);
  if (type === 'missclick') await setStatus(env, sender.token, null, null);

  await insertEvent(env, sender.pair_id, sender.slot, type, level, now);

  const partner = await getPartner(env, sender);
  if (!partner) return { deduped: false, push: 'no-target' };

  const message = buildMessage(sender, type, level);
  let result: PushResult;
  try {
    result = await sendPush(env, partner, message);
  } catch (error) {
    console.error('Error enviando push', error);
    result = 'error';
  }

  // La suscripcion murio (app desinstalada, permiso revocado): la limpiamos para no
  // reintentar en cada senal. El dispositivo se volvera a registrar al abrir la app.
  if (result === 'gone') {
    const column = partner.platform === 'android' ? 'fcm_token' : 'push_sub';
    await env.DB.prepare(`UPDATE devices SET ${column} = NULL WHERE token = ?`)
      .bind(partner.token)
      .run();
  }

  return { deduped: false, push: result };
}
