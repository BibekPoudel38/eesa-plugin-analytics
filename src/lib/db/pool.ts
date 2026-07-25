import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * Shared Postgres/TimescaleDB pool. One pool per process, stashed on globalThis
 * so Next's dev HMR and route-module reloads don't leak connections.
 *
 * The plugin owns this database (DATABASE_URL on Coolify). It holds BOTH the
 * relational metadata (sites, funnels, members) and the events hypertable +
 * continuous aggregates. See db/schema.sql.
 */

const g = globalThis as unknown as { __eesaPool?: Pool };

export function pool(): Pool {
  if (g.__eesaPool) return g.__eesaPool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  g.__eesaPool = new Pool({
    connectionString,
    max: Number(process.env.PG_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    // Managed Postgres (incl. Timescale Cloud) usually needs TLS; allow opting
    // out for a local/self-hosted instance with PGSSL=disable.
    ssl:
      process.env.PGSSL === "disable"
        ? undefined
        : process.env.PGSSL === "no-verify"
          ? { rejectUnauthorized: false }
          : undefined,
  });
  return g.__eesaPool;
}

/** Thin typed query helper. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<T[]> {
  const res = await pool().query<T>(text, params as never[]);
  return res.rows;
}

/** Run a set of statements in one transaction. */
export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
