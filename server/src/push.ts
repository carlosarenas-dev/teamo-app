import { importRsaPrivateKey, importVapidKey, signJwt } from './crypto-utils';
import type { Device, Env } from './types';

export interface PushMessage {
  title: string;
  body: string;
  /** Agrupa notificaciones: un 'status' nuevo reemplaza al anterior en la bandeja. */
  tag: string;
  /** 'woop' suena distinto y entra con prioridad maxima. */
  kind: 'status' | 'woop' | 'missclick';
  data: Record<string, string>;
}

export type PushResult = 'sent' | 'no-target' | 'not-configured' | 'gone' | 'error';

/** Manda la notificacion al dispositivo que toque segun su plataforma. */
export async function sendPush(
  env: Env,
  device: Device,
  message: PushMessage,
): Promise<PushResult> {
  if (device.platform === 'android') return sendFcm(env, device, message);
  if (device.platform === 'web') return sendWebPush(env, device, message);
  return 'no-target';
}

// ---------------------------------------------------------------- FCM (Android)

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id: string;
}

const FCM_TOKEN_KEY = 'fcm:access_token';

async function fcmAccessToken(env: Env, sa: ServiceAccount): Promise<string> {
  const cached = await env.KV.get(FCM_TOKEN_KEY);
  if (cached) return cached;

  const now = Math.floor(Date.now() / 1000);
  const jwt = await signJwt(
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    },
    await importRsaPrivateKey(sa.private_key),
    'RSASSA-PKCS1-v1_5',
  );

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!response.ok) {
    throw new Error(`OAuth de Firebase fallo: ${response.status} ${await response.text()}`);
  }

  const token = (await response.json<{ access_token: string }>()).access_token;
  // El token vive 1 h; lo guardamos 55 min para no apurar el limite.
  await env.KV.put(FCM_TOKEN_KEY, token, { expirationTtl: 3300 });
  return token;
}

async function sendFcm(env: Env, device: Device, message: PushMessage): Promise<PushResult> {
  if (!device.fcm_token) return 'no-target';
  if (!env.FIREBASE_SA_JSON) return 'not-configured';

  const sa = JSON.parse(env.FIREBASE_SA_JSON) as ServiceAccount;
  const accessToken = await fcmAccessToken(env, sa);

  // Mensaje solo-datos: la app Android construye la notificacion para poder elegir
  // canal, sonido y refrescar el widget en el mismo paso.
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: device.fcm_token,
          data: { ...message.data, title: message.title, body: message.body, tag: message.tag, kind: message.kind },
          android: { priority: 'HIGH', ttl: '86400s' },
        },
      }),
    },
  );

  if (response.ok) return 'sent';
  if (response.status === 404) return 'gone'; // token FCM caducado o app desinstalada
  console.error('FCM fallo', response.status, await response.text());
  return 'error';
}

// ------------------------------------------------------------- Web Push (iPhone)

interface WebPushSubscription {
  endpoint: string;
  keys?: { p256dh: string; auth: string };
}

/**
 * Push SIN payload: solo despierta al Service Worker, que luego hace GET /api/state
 * y arma la notificacion. Asi nos saltamos por completo el cifrado aes128gcm, que es
 * la parte fragil de Web Push, a cambio de ~200 ms de latencia.
 */
async function sendWebPush(env: Env, device: Device, message: PushMessage): Promise<PushResult> {
  if (!device.push_sub) return 'no-target';
  if (!env.VAPID_PRIVATE_KEY || !env.VAPID_PUBLIC_KEY) return 'not-configured';

  const subscription = JSON.parse(device.push_sub) as WebPushSubscription;
  const audience = new URL(subscription.endpoint).origin;

  const jwt = await signJwt(
    { alg: 'ES256', typ: 'JWT' },
    {
      aud: audience,
      exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
      sub: env.VAPID_SUBJECT,
    },
    await importVapidKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY),
    { name: 'ECDSA', hash: 'SHA-256' },
  );

  const response = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      ttl: '86400',
      urgency: message.kind === 'woop' ? 'high' : 'normal',
      'content-length': '0',
    },
  });

  if (response.ok) return 'sent';
  // Apple/navegadores responden 404 o 410 cuando la suscripcion ya no existe.
  if (response.status === 404 || response.status === 410) return 'gone';
  console.error('Web Push fallo', response.status, await response.text());
  return 'error';
}
