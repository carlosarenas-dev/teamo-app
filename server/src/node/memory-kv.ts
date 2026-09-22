import type { Env } from '../types';

/**
 * Cache en memoria del proceso Node, para sustituir a KV. Solo se usa para
 * cachear el access token de Firebase ~55 min (ver push.ts): al ser un unico
 * proceso persistente (no isolates efimeros como en Workers), un Map en
 * memoria es incluso mas simple y directo que KV para este caso.
 */
export function createMemoryKV(): Env['KV'] {
  const store = new Map<string, { value: string; expiresAt: number }>();

  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt < Date.now()) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(
      key: string,
      value: string,
      options?: { expirationTtl?: number },
    ): Promise<void> {
      const ttlMs = (options?.expirationTtl ?? 3600) * 1000;
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
  } as unknown as Env['KV'];
}
