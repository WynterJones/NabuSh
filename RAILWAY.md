# Railway deployment notes

Both Nabu services — `web` and `worker` — build from **this same repo and the
same Dockerfile**, and differ only by the `NABU_MODE` environment variable.

## Why the healthcheck is not in `railway.json`

By default Railway reads a single `railway.json` at the repo root and applies it
to **every service built from that repo**.

The worker has no HTTP server. If `healthcheckPath` lived in `railway.json`, the
worker would inherit it, never pass, and Railway would mark a perfectly healthy
worker as a failed deploy — on every push, forever.

So `railway.json` carries only what is true for both services (Dockerfile
builder, restart policy). The healthcheck is set **on the web service only**:

- Healthcheck path: `/api/health`
- Healthcheck timeout: `120`

> A per-service config path *is* possible — the API exposes `railwayConfigFile`
> on a service instance, so one service can be pointed at `railway.web.json` and
> another at `railway.worker.json`. It isn't covered in the config-as-code docs.
> We don't use it here: these services are image-sourced, so their settings live
> on the service (and get captured by the template) rather than in the repo.

## Registry credentials (required for the private image)

Both app services pull `ghcr.io/wynterjones/nabush:latest`, which is a **private**
package. Railway cannot pull it until credentials are set on each service:

- Username: `WynterJones`
- Password: a GitHub **classic PAT with only the `read:packages` scope**

Create it at <https://github.com/settings/tokens> → *Generate new token
(classic)*. Do not reuse the `gh` CLI's OAuth token — it rotates, and Railway
would start failing to pull without warning.

Set it per service: **Settings → Source → Docker image → registry credentials**.
Railway encrypts and stores it, and anyone deploying the template later sees
only "hidden registry credentials in use".

> **Alternative:** make the GHCR *package* public while keeping the repo private.
> Package visibility is independent of repo visibility, so the source stays
> closed and only the compiled image is pullable. No credentials anywhere, and
> nothing to rotate or break. Once licensing is switched on, the licence key is
> the paywall rather than image obscurity — which is how most commercial
> self-hosted products work.
>
> There is **no API for this** — it is UI-only, at
> `https://github.com/users/<user>/packages/container/<package>/settings` →
> Danger Zone → Change visibility. And per GitHub: *"Once you make a package
> public, you cannot make it private again."* The only way back is to delete the
> package and republish under a different name.

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

## How customers get updates

**Railway's "template updated" notifications do not apply here.** That feature
only works for services deployed from a GitHub repo. Our template's services are
Docker-image-based, so publishing a new template version notifies nobody.

The mechanism that *does* work for image services is **Image Auto Updates**:

- Service → **Settings → Source → Configure Auto Updates**
- Railway watches the configured tag, notices a new digest, and redeploys
- Detection is cached for **up to a few hours** — it is not instant
- Supported for GHCR and Docker Hub only
- Workspace admins get a notification when an update is applied
- On Pro, Railway takes a volume backup before redeploying

It is **not exposed in the public GraphQL API** (`ServiceInstance` has no field
for it), so it has to be toggled in the dashboard — set it on both services in
this project before generating the template so customer installs inherit it.

### The release flow

```
commit to main   ->  :latest moves        ->  nobody is affected
git tag v1.1.0   ->  :stable moves        ->  customers auto-update within hours
                     (+ :v1, :v1.1, :v1.1.0)
```

Customer services track **`:stable`**. Pushing to `main` cannot reach them. A
release is exactly one deliberate act: `git tag -a v1.1.0 && git push --tags`.

### What happens on a customer's box during an update

1. Railway pulls the new image and restarts the service.
2. The container runs migrations on boot, under a Postgres advisory lock, so web
   and worker can restart together without racing.
3. The worker catches `SIGTERM` and drains in-flight runs for up to 30s before
   exiting, so an update doesn't kill a report mid-write.

### Risks worth respecting

- **Auto-update plus auto-migrate means a bad migration reaches every customer
  with no gate.** There is no staging environment between your `git tag` and
  their production. Test with `docker compose up` locally against a copy of a
  realistic database *before* tagging.
- **Migrations are forward-only.** Drizzle generates no down-migrations, and
  Railway can roll back an image but not a schema. Prefer additive changes: add
  nullable columns, never rename or drop in the same release that stops using
  them. Split destructive changes across two releases.
- **Never point a customer service at `:latest`.** With auto-updates on, every
  commit to main would ship to production.

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
