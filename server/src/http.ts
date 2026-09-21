/** Helpers de respuesta. La PWA y la app Android consumen exactamente esto. */

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string, message?: string) {
    super(message ?? code);
  }
}

export function badRequest(code: string, message?: string): never {
  throw new HttpError(400, code, message);
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, 'invalid_json', 'El cuerpo no es JSON valido');
  }
}
