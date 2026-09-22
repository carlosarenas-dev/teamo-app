/**
 * Punto de entrada para correr el MISMO backend (server/src/index.ts, escrito
 * contra la API de Cloudflare Workers) sobre un servidor Node normal, vía los
 * adaptadores de esta carpeta. No se toca ni una linea del resto de server/src:
 * solo se le da a `handler.fetch(request, env)` un `env` cuyos DB/KV/ASSETS
 * son SQLite/memoria/archivos en vez de D1/KV/ASSETS de Cloudflare.
 *
 * Uso:
 *   PORT=8787 VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... npx tsx src/node/server.ts
 */
import http from 'node:http';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import handler from '../index';
import type { Env } from '../types';
import { openSqliteD1 } from './sqlite-d1';
import { createMemoryKV } from './memory-kv';
import { createStaticAssets } from './static-assets';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..'); // server/src/node -> woop/

const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.DB_PATH ?? path.join(repoRoot, 'server', 'data', 'teamo.sqlite');
const WEB_DIST = process.env.WEB_DIST ?? path.join(repoRoot, 'web', 'dist');

mkdirSync(path.dirname(DB_PATH), { recursive: true });

const env: Env = {
  DB: openSqliteD1(DB_PATH),
  KV: createMemoryKV(),
  ASSETS: createStaticAssets(WEB_DIST) as unknown as Env['ASSETS'],
  VAPID_SUBJECT: process.env.VAPID_SUBJECT ?? 'mailto:example@example.com',
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY ?? '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
  FIREBASE_SA_JSON: process.env.FIREBASE_SA_JSON,
};

async function toWebRequest(req: http.IncomingMessage): Promise<Request> {
  const url = `http://${req.headers.host ?? `localhost:${PORT}`}${req.url}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
    else if (Array.isArray(value)) headers.set(key, value.join(', '));
  }

  let body: Buffer | undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    if (chunks.length) body = Buffer.concat(chunks);
  }

  return new Request(url, { method: req.method, headers, body });
}

const server = http.createServer(async (req, res) => {
  try {
    const request = await toWebRequest(req);
    const response = await handler.fetch(request, env);

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (response.body) {
      res.end(Buffer.from(await response.arrayBuffer()));
    } else {
      res.end();
    }
  } catch (error) {
    console.error('Error atendiendo la peticion:', error);
    res.statusCode = 500;
    res.end('Error interno');
  }
});

server.listen(PORT, () => {
  console.log(`Teamo (Node) escuchando en http://127.0.0.1:${PORT}`);
  console.log(`Base de datos SQLite: ${DB_PATH}`);
  console.log(`Archivos estaticos:   ${WEB_DIST}`);
  console.log(`VAPID configurado:    ${env.VAPID_PUBLIC_KEY ? 'si' : 'NO (Web Push no funcionara)'}`);
  console.log(`Firebase configurado: ${env.FIREBASE_SA_JSON ? 'si' : 'no (push a Android no funcionara)'}`);
});
