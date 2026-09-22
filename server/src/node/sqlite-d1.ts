import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Env } from '../types';

const here = path.dirname(fileURLToPath(import.meta.url));
// server/src/node/sqlite-d1.ts -> server/schema.sql
const SCHEMA_PATH = path.join(here, '..', '..', 'schema.sql');

/**
 * El schema.sql tiene DROP TABLE al principio (pensado para reaplicarse a
 * mano con `wrangler d1 execute`), asi que aqui solo se ejecuta la PRIMERA
 * vez que arranca contra un archivo nuevo — si no, cada reinicio del
 * servicio (systemd, un deploy, etc.) borraria todos los datos.
 */
function ensureSchema(db: Database.Database): void {
  const hasDevicesTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='devices'")
    .get();
  if (hasDevicesTable) return;

  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
}

/**
 * Imita lo minimo de la API de D1 que usa el resto del codigo (prepare/bind/
 * first/all/run/batch), para poder correr el MISMO server/src/index.ts sin
 * tocarlo, sobre SQLite normal en un servidor Node cualquiera. El schema.sql
 * es SQLite valido en los dos casos, asi que no hace falta ni tocarlo.
 *
 * D1 real devuelve un objeto NUEVO en cada `.bind()` (inmutable); aqui se
 * muta el mismo objeto porque en todo el codebase cada `.prepare()` se
 * encadena con un solo `.bind()` inmediato, nunca se reutiliza el statement
 * sin bindear para varios binds distintos.
 */
export function openSqliteD1(filePath: string): Env['DB'] {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  ensureSchema(db);

  function prepare(sql: string) {
    const stmt = db.prepare(sql);
    let boundArgs: unknown[] = [];

    const bound = {
      bind(...args: unknown[]) {
        boundArgs = args;
        return bound;
      },
      async first<T>(): Promise<T | null> {
        const row = stmt.get(...boundArgs);
        return (row as T) ?? null;
      },
      async all<T>(): Promise<{ results: T[] }> {
        return { results: stmt.all(...boundArgs) as T[] };
      },
      async run(): Promise<{ success: true }> {
        stmt.run(...boundArgs);
        return { success: true };
      },
      // Solo para uso interno de `batch()` de aqui abajo: D1 real no lo tiene.
      _exec(): void {
        stmt.run(...boundArgs);
      },
    };
    return bound;
  }

  return {
    prepare,
    async batch(statements: ReturnType<typeof prepare>[]) {
      const runAll = db.transaction((stmts: typeof statements) => {
        for (const statement of stmts) statement._exec();
      });
      runAll(statements);
      return statements.map(() => ({ success: true as const }));
    },
  } as unknown as Env['DB'];
}
