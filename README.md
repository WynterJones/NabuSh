# Nabu

**Scheduled agents that work on their own and report back.**

Nabu is a self-hosted app for building agents that run on a cron schedule. Each
agent has its own instructions, its own database it creates and manages itself,
and its own inbox. When a scheduled run finishes, the agent files a written
report. There is no chat — you configure agents, schedule them, and read what
they send you.

You host it. You bring your own Anthropic key. Your data never leaves your
server.

---

## Install on Railway (recommended)

1. Click **Deploy on Railway**.
2. Wait for the build. Railway provisions Postgres, the web service and the
   worker together, and generates `NABU_SECRET` for you.
3. Open the generated URL and create your account.
4. Go to **Settings** and paste your Anthropic API key.

That's it. Create an agent, give it a schedule, and reports start arriving.

See [RAILWAY.md](./RAILWAY.md) for the service configuration and how the
template is produced.

**What it costs to run:** Railway bills you for compute and Postgres (a small
instance is enough for most setups). Anthropic bills you for tokens. Nabu takes
no cut of either.

## Install with Docker Compose

For a VPS, a homelab, Coolify, or your own machine.

```bash
curl -O https://raw.githubusercontent.com/nabu-sh/nabu/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/nabu-sh/nabu/main/.env.example

# Generate the secret that encrypts your stored API key
echo "NABU_SECRET=$(openssl rand -hex 32)" >> .env

docker compose up -d
```

Open <http://localhost:3000>.

Serving over plain HTTP on a LAN address? Set `NABU_ALLOW_HTTP=true` or the
session cookie will be dropped and login will appear to fail.

---

## How it works

**Agent** — a name, a set of standing instructions, a model, and a toolset.
Think of it as a job description.

**Schedule** — a cron expression plus a task prompt. When it fires, the agent
wakes up with its instructions and that task.

**Run** — one execution. The agent loops with its tools until it calls
`submit_report`, or until it hits a step, token, or time limit.

**Report** — the agent's written output, filed to the inbox. Every run produces
one, including failures. A silent inbox always means "nothing happened", never
"something broke quietly".

**Database** — each agent creates its own tables during a run and reads and
writes them across runs. That's how an agent remembers what it saw yesterday.
You can view and edit the rows yourself.

### Tools available to an agent

| Tool | Notes |
| --- | --- |
| `create_table`, `list_tables` | Always on |
| `insert_rows`, `query_rows`, `update_rows`, `delete_rows` | Always on |
| `web_fetch` | Opt-in per agent — reads a URL as text |
| `submit_report` | Terminal; ends the run and files the report |

---

## Architecture

One Docker image runs in two modes, selected by `NABU_MODE`:

- **`web`** — the Next.js UI, and it applies migrations on boot
- **`worker`** — fires due schedules, claims queued runs, executes them

The job queue is the `runs` table itself, claimed with `FOR UPDATE SKIP LOCKED`.
There is no Redis, no external queue, and no third-party job service — the whole
system is one image plus one Postgres database, which is what keeps the install
to a single click.

Web and worker both migrate on boot and contend for a Postgres advisory lock, so
whichever starts second simply waits.

Runs are heartbeated. If a worker dies mid-run, the next one reclaims the row
after 15 minutes and files a failure report rather than leaving it stuck.

---

## Configuration

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Postgres connection string |
| `NABU_SECRET` | yes | Encrypts the stored API key and signs sessions |
| `NABU_MODE` | no | `web` (default) or `worker` |
| `NABU_MAX_CONCURRENT_RUNS` | no | Runs executed at once, default `3` |
| `NABU_ALLOW_HTTP` | no | Set `true` when serving over plain HTTP |
| `PORT` | no | Default `3000` |

Your Anthropic key is **not** an environment variable. It's entered in Settings
and stored encrypted, so you can rotate it without a redeploy.

⚠️ Changing `NABU_SECRET` after setup makes the stored API key unreadable and
you'll be prompted to re-enter it. Agents and their data are unaffected.

---

## Development

```bash
npm install
cp .env.example .env          # set DATABASE_URL and NABU_SECRET
createdb nabu_dev

npm run db:push               # apply schema
npm run seed                  # sample agents, schedules and reports
npm run dev                   # UI on :3000
npm run dev:worker            # worker, in a second terminal
```

Seeded login: the email in `scripts/seed.ts` with password `password123`.

| Command | Does |
| --- | --- |
| `npm run smoke` | Integration checks against a real Postgres — crypto, tools, queue, scheduler |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate a migration after editing `src/db/schema.ts` |

### Licensing

Licence enforcement is **dormant**. The code in `src/lib/license.ts` verifies
against Gumroad, but it switches on only when `NABU_GUMROAD_PRODUCT_ID` is set
at image build time. It is unset, so Nabu currently runs unrestricted with no
key required and no checks performed.
