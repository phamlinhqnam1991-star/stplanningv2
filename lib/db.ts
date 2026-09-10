import { Pool, type PoolClient, type QueryResultRow } from "pg";

let pool: Pool | null = null;

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  const isLocal = /localhost|127\.0\.0\.1/i.test(connectionString);
  const ca = process.env.AIVEN_CA_CERT?.replace(/\\n/g, "\n").trim();

  return new Pool({
    connectionString,
    max: 1,
    idleTimeoutMillis: 5_000,
    connectionTimeoutMillis: 10_000,
    maxLifetimeSeconds: 60,
    allowExitOnIdle: true,
    application_name: "st-planning-clean-rebuild",
    ssl: isLocal
      ? false
      : ca
        ? { ca, rejectUnauthorized: true }
        : { rejectUnauthorized: false },
  });
}

export function getPool(): Pool {
  if (!pool) pool = createPool();
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]) {
  return getPool().query<T>(text, values);
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
