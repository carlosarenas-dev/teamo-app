import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sustituye al binding ASSETS de Cloudflare: sirve el `web/dist` ya
 * construido, con el mismo comportamiento que
 * `not_found_handling = "single-page-application"` de wrangler.toml (una
 * ruta que no es un archivo cae a index.html, para que el enrutado del lado
 * del cliente de la PWA funcione igual).
 */
export function createStaticAssets(distDir: string): { fetch(request: Request): Promise<Response> } {
  const root = path.resolve(distDir);

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const requested = path.join(root, decodeURIComponent(url.pathname));

      // Nunca servir nada fuera de dist/, ni aunque la URL venga con "..".
      if (!path.resolve(requested).startsWith(root)) {
        return new Response('Not found', { status: 404 });
      }

      let filePath = requested;
      if (url.pathname === '/' || !(await exists(filePath)) || (await stat(filePath)).isDirectory()) {
        filePath = path.join(root, 'index.html');
      }

      try {
        const body = await readFile(filePath);
        const contentType = MIME[path.extname(filePath)] ?? 'application/octet-stream';
        return new Response(body, { headers: { 'content-type': contentType } });
      } catch {
        return new Response('Not found', { status: 404 });
      }
    },
  };
}
