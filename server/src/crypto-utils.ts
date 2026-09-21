/** Utilidades base64url + firma JWT sobre WebCrypto (lo unico disponible en Workers). */

export function bytesToB64url(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(
    value.length + ((4 - (value.length % 4)) % 4),
    '=',
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Lo que acepta subtle.sign en este runtime, sin atarnos al nombre del tipo. */
export type SignAlgorithm = Parameters<SubtleCrypto['sign']>[0];

const encoder = new TextEncoder();

function encodeSegment(value: unknown): string {
  return bytesToB64url(encoder.encode(JSON.stringify(value)));
}

/**
 * Construye un JWT compacto. WebCrypto devuelve la firma ECDSA como r||s crudo,
 * que es exactamente el formato que pide ES256 — no hace falta convertir de DER.
 */
export async function signJwt(
  header: Record<string, unknown>,
  claims: Record<string, unknown>,
  key: CryptoKey,
  algorithm: SignAlgorithm,
): Promise<string> {
  const signingInput = `${encodeSegment(header)}.${encodeSegment(claims)}`;
  const signature = await crypto.subtle.sign(algorithm, key, encoder.encode(signingInput));
  return `${signingInput}.${bytesToB64url(signature)}`;
}

/** Importa una clave privada RSA en PEM PKCS#8 (la de la service account de Firebase). */
export async function importRsaPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\s+/g, '');
  const der = b64urlToBytes(body.replace(/\+/g, '-').replace(/\//g, '_'));
  return crypto.subtle.importKey(
    'pkcs8',
    der as unknown as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

/**
 * Importa la clave VAPID a partir del par (publica de 65 bytes, privada de 32).
 * La publica es un punto sin comprimir 0x04 || x || y, de donde salen x e y del JWK.
 */
export async function importVapidKey(
  publicKeyB64url: string,
  privateKeyB64url: string,
): Promise<CryptoKey> {
  const publicKey = b64urlToBytes(publicKeyB64url);
  if (publicKey.length !== 65 || publicKey[0] !== 0x04) {
    throw new Error('VAPID_PUBLIC_KEY debe ser un punto P-256 sin comprimir (65 bytes)');
  }
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'EC',
      crv: 'P-256',
      x: bytesToB64url(publicKey.slice(1, 33)),
      y: bytesToB64url(publicKey.slice(33, 65)),
      d: privateKeyB64url,
      ext: true,
    },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
}
