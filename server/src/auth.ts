import { getDeviceByToken } from './db';
import { HttpError } from './http';
import type { Device, Env } from './types';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Credencial de dispositivo: 32 bytes aleatorios. No hay usuarios ni contrasenas. */
export function newDeviceToken(): string {
  return hex(crypto.getRandomValues(new Uint8Array(32)));
}

export function newPairId(): string {
  return crypto.randomUUID();
}

/**
 * Codigo de emparejamiento de 6 digitos, uniforme y sin sesgo de modulo.
 * Se rechazan los valores del final del rango de 32 bits que no reparten parejo.
 */
export function newPairingCode(): string {
  const limit = Math.floor(0xffffffff / 1_000_000) * 1_000_000;
  const buf = new Uint32Array(1);
  let value: number;
  do {
    crypto.getRandomValues(buf);
    value = buf[0]!;
  } while (value >= limit);
  return String(value % 1_000_000).padStart(6, '0');
}

export async function requireDevice(request: Request, env: Env): Promise<Device> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) throw new HttpError(401, 'missing_token', 'Falta el token del dispositivo');

  const device = await getDeviceByToken(env, token);
  if (!device) throw new HttpError(401, 'unknown_token', 'Dispositivo no reconocido');
  return device;
}
