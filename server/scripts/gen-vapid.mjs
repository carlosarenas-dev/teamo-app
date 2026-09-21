// Genera el par de claves VAPID para Web Push. Se ejecuta una sola vez.
//   node scripts/gen-vapid.mjs
import { webcrypto } from 'node:crypto';

const b64url = (buffer) =>
  Buffer.from(buffer).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
  'sign',
  'verify',
]);

const publicKey = b64url(await webcrypto.subtle.exportKey('raw', pair.publicKey));
const privateKey = (await webcrypto.subtle.exportKey('jwk', pair.privateKey)).d;

console.log('\nVAPID_PUBLIC_KEY  (va en wrangler.toml, en [vars]):');
console.log(publicKey);
console.log('\nVAPID_PRIVATE_KEY (es secreto, NO lo pongas en wrangler.toml):');
console.log(privateKey);
console.log('\nGuardalo con:');
console.log('  npx wrangler secret put VAPID_PRIVATE_KEY');
console.log('Y para desarrollo local, crea server/.dev.vars con:');
console.log(`  VAPID_PRIVATE_KEY=${privateKey}\n`);
