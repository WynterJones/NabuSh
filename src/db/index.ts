import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. On Railway this is wired automatically by the template; " +
      "locally, copy .env.example to .env and point it at a Postgres instance.",
  );
}

declare global {
  var __nabuSql: ReturnType<typeof postgres> | undefined;
}

// Next dev reloads modules on every edit; without this the pool count climbs
// until Postgres refuses new connections.
const client =
  globalThis.__nabuSql ??
  postgres(connectionString, {
    max: 10,
    // Railway's Postgres plugin terminates plaintext connections but presents a
    // self-signed cert, which `require` accepts and `verify-full` would not.
    ssl: connectionString.includes("sslmode=require") ? "require" : undefined,
  });

if (process.env.NODE_ENV !== "production") globalThis.__nabuSql = client;

export const db = drizzle(client, { schema });
export { client as sql };
export * from "./schema";
