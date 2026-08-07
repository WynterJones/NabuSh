# Railway deployment notes

Both Nabu services — `web` and `worker` — build from **this same repo and the
same Dockerfile**, and differ only by the `NABU_MODE` environment variable.

## Why the healthcheck is not in `railway.json`

Railway looks for a single `railway.json` at the repo root and applies it to
**every service built from that repo**. There is no per-service config path.

The worker has no HTTP server. If `healthcheckPath` lived in `railway.json`, the
worker would inherit it, never pass, and Railway would mark a perfectly healthy
worker as a failed deploy — on every push, forever.

So `railway.json` carries only what is true for both services (Dockerfile
builder, restart policy). The healthcheck is set **on the web service only**,
in Railway's service settings:

- Healthcheck path: `/api/health`
- Healthcheck timeout: `120`

## Service configuration

### `Postgres`

Railway's standard Postgres plugin. No configuration needed.

### `web`

| Variable | Value |
| --- | --- |
| `NABU_MODE` | `web` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `NABU_SECRET` | `${{secret(64)}}` |

Generate a public domain for this service — it's the UI.

### `worker`

| Variable | Value |
| --- | --- |
| `NABU_MODE` | `worker` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `NABU_SECRET` | `${{web.NABU_SECRET}}` |
| `NABU_MAX_CONCURRENT_RUNS` | `3` |

No domain. No healthcheck.

> **`NABU_SECRET` must be identical on both services.** It derives the key that
> encrypts the stored Anthropic API key. If the worker's differs from the web's,
> the UI will save a key that the worker cannot decrypt, and every run will fail
> with "no API key configured" while Settings shows one present.

That's why the worker references `${{web.NABU_SECRET}}` rather than generating
its own — Railway resolves it to the same value.

## Turning this project into a one-click template

Railway templates can only be created through the dashboard; there is no
code-based definition. The path is:

1. Get this project deployed and working.
2. Project **Settings → Generate Template from Project**.
3. In the composer, confirm each service's variables. Mark `NABU_SECRET` as
   generated (`${{secret(64)}}`) so every deploy gets its own.
4. Publish. Railway returns a template URL for the **Deploy on Railway** button.

Anyone deploying the template then gets all three services wired together, and
Railway notifies them when a new version is published.
