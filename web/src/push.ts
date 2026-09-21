import { api } from './api';

export type PushSetupResult =
  | 'ok'
  | 'denied'
  | 'unsupported'
  | 'needs-install'
  | 'not-configured';

export function isIos(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

/** En iOS el push SOLO funciona si la web esta instalada en la pantalla de inicio. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | null {
  return 'Notification' in window ? Notification.permission : null;
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch (error) {
    console.error('No se pudo registrar el Service Worker', error);
    return null;
  }
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Pide permiso y registra la suscripcion. Debe llamarse desde un gesto del usuario:
 * iOS ignora la peticion de permiso si no viene de un toque.
 */
export async function enablePush(): Promise<PushSetupResult> {
  if (!pushSupported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported';
  if (isIos() && !isStandalone()) return 'needs-install';

  const { vapidPublicKey } = await api.config();
  if (!vapidPublicKey) return 'not-configured';

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';

  const registration = (await navigator.serviceWorker.ready) as ServiceWorkerRegistration;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true, // obligatorio: cada push debe mostrar algo
      applicationServerKey: base64UrlToBytes(vapidPublicKey) as BufferSource,
    }));

  await api.register({ platform: 'web', pushSub: subscription.toJSON() });
  return 'ok';
}

/**
 * Safari no implementa la Battery Status API, asi que en iPhone esto no devuelve nada
 * y la bateria llega por las automatizaciones de Atajos. En Android Chrome si funciona.
 */
export async function reportBattery(): Promise<void> {
  const getBattery = (navigator as unknown as {
    getBattery?: () => Promise<{ level: number; charging: boolean }>;
  }).getBattery;
  if (!getBattery) return;

  try {
    const battery = await getBattery.call(navigator);
    await api.battery(Math.round(battery.level * 100), battery.charging);
  } catch {
    // sin bateria disponible: no es un fallo, simplemente no reportamos
  }
}
