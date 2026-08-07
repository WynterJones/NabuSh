import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/**
 * Applies pending migrations at container start. Self-hosted customers never
 * run a CLI, so the app has to migrate itself or an upgrade silently breaks.
 *
 * Uses its own single-connection client (`max: 1`) because the pooled client in
 * `db/index.ts` would let two boots interleave DDL.
 */
/** Arbitrary but stable key so both services contend for the same lock. */
const MIGRATION_LOCK_ID = 4827301;

export async function runMigrations(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const client = postgres(connectionString, {
    max: 1,
    ssl: connectionString.includes("sslmode=require") ? "require" : undefined,
    // The migrator's CREATE ... IF NOT EXISTS statements emit "already exists,
    // skipping" NOTICEs on every boot after the first. Dumping those to the
    // console makes a healthy startup look like an error to someone reading
    // their own container logs.
    onnotice: () => {},
  });

  try {
    // The web and worker services boot from the same image at the same time.
    // Without a lock both would run the migrator concurrently and one would
    // fail on a duplicate relation, crash-looping the deploy.
    await client`SELECT pg_advisory_lock(${MIGRATION_LOCK_ID})`;
    try {
      await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
      console.log("[nabu] migrations up to date");
    } finally {
      await client`SELECT pg_advisory_unlock(${MIGRATION_LOCK_ID})`;
    }
  } finally {
    await client.end();
  }
}

// Allow `tsx src/db/migrate.ts` as a standalone step in the container entrypoint.
if (process.argv[1]?.includes("migrate")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("[nabu] migration failed:", err);
      process.exit(1);
    });
}
