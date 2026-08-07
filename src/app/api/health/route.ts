import { sql } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Railway's healthcheck target. Reports unhealthy when Postgres is unreachable
 * so a broken DATABASE_URL fails the deploy loudly instead of serving a UI that
 * errors on every page.
 */
export async function GET() {
  try {
    await sql`SELECT 1`;
    return Response.json({ status: "ok", database: "connected" });
  } catch (err) {
    return Response.json(
      { status: "error", database: err instanceof Error ? err.message : "unreachable" },
      { status: 503 },
    );
  }
}
