# Nabu.sh — PRD

> Status: v1 is **built**. This document is the spec; see `README.md` for how it
> installs and runs. Sections marked *(shipped)* exist in the codebase today.

## 1. Summary

Nabu is a **self-hosted, BYOK app for scheduled autonomous agents**, sold as a
one-time purchase on Gumroad and deployed by the customer to their own Railway
account in one click. The user creates agents, gives each a prompt-based
identity, schedules it with cron, and the agent runs on its own — reading and
writing its own database tables and filing a written **report to the inbox**
when it finishes.

There is **no chat**. The agent is never talked to; it is configured,
scheduled, and read.

**Business model: we sell the software, not the hosting.** Customers buy a
license, one-click deploy to their own Railway account, and plug in their own
model API key. They pay Railway for compute and Anthropic for tokens. We carry
no cron fleet, no agent execution costs, no customer data, and no API-key
liability.

The mental model is a small team of employees: each has a job description, a
calendar, a filing cabinet, and sends you a memo when a task is done.

## 2. Goals / Non-Goals

**Goals**
- Purchase → deployed → first scheduled report in under 15 minutes.
- Create and manage agents with no code.
- Cron-scheduled runs that execute reliably and durably.
- Each agent owns a private database it can create and modify itself.
- Every completed run produces a report in an inbox.
- Zero operational load on us: no hosted runtime, no customer secrets.

**Non-Goals**
- A hosted/cloud edition (v1 is self-host only — this is the whole point).
- Chat or any conversational UI.
- Multi-tenancy. One deployment serves one customer.
- Marketplace, public agent gallery, agent-to-agent messaging.
- Mobile app.

## 3. Users

| Persona | Need |
| --- | --- |
| Solo operator / indie hacker | Automate recurring research, monitoring, reporting without writing scripts — and own the box |
| Ops / analyst | A daily digest derived from live data, stored and queryable |
| Privacy-sensitive buyer | Agents touching internal data that must never leave their infrastructure |

Self-hosting is a **feature** for all three: their keys, their data, their box.

## 4. Distribution & Licensing

### One-click deploy

**Primary target: Railway.** One template provisions the whole system —
Postgres + web + worker in a single project, no duration caps on runs, and
Railway pushes update notifications to everyone who deployed the template when
we ship a new version. Railway also supports private Docker images for
proprietary code, which is how we ship without publishing source.

- Template contains: `web` service, `worker` service, `Postgres` plugin.
- Prompted env vars on deploy: `NABU_LICENSE_KEY`, `ADMIN_EMAIL`,
  `ADMIN_PASSWORD`. Everything else has defaults or is generated.
- `ANTHROPIC_API_KEY` is **not** an env var — it's entered in the UI after
  first login, so a customer can rotate it without a redeploy.
- Railway Open Source Partner Program pays template creators up to 25%
  commission on usage — a secondary revenue line worth applying for.

**Secondary: Docker Compose.** One `docker-compose.yml` (app + Postgres) for
Coolify, Fly, a VPS, or a homelab. Same image as the Railway template.

**Vercel: not supported in v1, deliberately.** Functions cap at 300s on Hobby
and 800s on Pro, which truncates any agent run longer than a few steps, and
Vercel ships no database — every install would need a second vendor wired up by
hand. Revisit only if we split the worker onto a separate always-on host, which
defeats the one-click promise.

### Packaging *(shipped)*

Ship as a **private Docker image on GHCR**. The Railway template holds the
registry credentials: Railway encrypts and stores them, and **the person
deploying never sees or needs them** — they see only that hidden credentials are
in use. This is what makes a closed-source product installable by a non-technical
buyer in one click. (Trade-off: Railway disables SSH for services using hidden
credentials. Irrelevant here.)

Source stays closed, updates are a tag bump, and Railway's built-in update
notifications tell every deployer a new version exists.

### License enforcement *(shipped)*

**Gumroad is the license server — there is nothing for us to build or operate.**
`POST https://api.gumroad.com/v2/licenses/verify` with `product_id` and
`license_key` returns success, a uses counter, and refund / dispute /
subscription-cancelled metadata. All of it is checked.

Implementation rules, all live in `src/lib/license.ts`:

- **`increment_uses_count` defaults to TRUE on Gumroad's side.** We re-verify
  every 24h, so leaving the default would inflate the counter by one per day per
  instance and make it useless for seat limits. We pass `true` exactly once, at
  activation, and `false` on every heartbeat.
- **Fail open with a 14-day grace period.** If Gumroad has an outage, a
  customer's agents must not stop. Never brick someone else's production over a
  third party's uptime.
- Invalid or expired → persistent UI banner, schedules pause, in-flight runs
  finish, **data is never touched and the UI stays fully readable**.
- A 404 from Gumroad is a valid answer ("unknown key"), not a transport failure;
  only other error codes trigger the grace path.
- Enforcement in software the customer runs is soft by design. The moat is
  updates, support, and the private image — not DRM. Don't harden past this.

Licensing disables itself entirely when `NABU_GUMROAD_PRODUCT_ID` is unset, so
dev and self-built images run unrestricted.

### Pricing (proposed)

| Tier | Price | Includes |
| --- | --- | --- |
| Personal | $99 one-time | Unlimited agents, 1 instance, 1 year of updates |
| Pro | $199/yr | Unlimited agents + instances, updates while active, priority support |

One-time-with-lapsing-updates avoids the "my self-hosted app stopped working"
resentment that kills subscription-gated self-host products: when a license
lapses the software keeps running, it just stops receiving new versions.

Gumroad handles checkout, VAT/sales tax, and license-key generation. Enable
"Generate a unique license key per sale" on the product.

## 5. Core Concepts

- **Agent** — a named worker with `instructions` (system prompt), a model
  choice, an enabled toolset, its own database namespace, its own schedules,
  and its own inbox.
- **Schedule** — a cron expression + a **task prompt**. Firing starts a Run.
- **Run** — one execution. Status (`queued | running | succeeded | failed`), a
  step log, token/cost usage; produces exactly one Report.
- **Report** — the agent's written output for a Run. Markdown, lands in the
  inbox with a subject and read/unread state.
- **Agent Database** — per-agent tables the agent creates and CRUDs at runtime.
  Human-viewable and human-editable in the UI.

### Data model (sketch)

Single-tenant: **no `user_id` scoping anywhere.** One deployment = one
customer. `users` exists only for login.

```
users(id, email, password_hash, created_at)          -- admin + optional invitees
settings(key, value_encrypted)                        -- API keys, license, timezone
agents(id, name, avatar, instructions, model, tools_enabled, status, created_at)
schedules(id, agent_id, name, cron, timezone, task_prompt, enabled, last_run_at, next_run_at)
runs(id, agent_id, schedule_id, status, started_at, ended_at, steps_json, tokens_in, tokens_out, error)
reports(id, run_id, agent_id, subject, body_md, is_read, created_at)
agent_tables(id, agent_id, name, schema_json, created_at)
agent_rows(id, agent_table_id, data_jsonb, created_at, updated_at)
```

Agent data is stored as JSONB rows against a user-declared schema — an agent
can create a "table" at runtime without DDL or migrations.

## 6. Agent Runtime

A Run is a bounded tool-use loop:

1. Scheduler fires → Run created → agent's `instructions` + the schedule's
   `task_prompt` + a summary of its existing tables are assembled as context.
2. The model loops with tools until it calls `submit_report` or hits a limit
   (max steps, max tokens, wall-clock timeout).
3. `submit_report(subject, body_md)` ends the run and writes to the inbox.
4. Failures write a failure report to the inbox too — silence is never the
   outcome.

**Built-in tools (v1)**
- `create_table(name, columns)` / `list_tables()` / `drop_table(name)`
- `insert_rows` / `query_rows` / `update_rows` / `delete_rows`
- `web_fetch(url)` — read a page as text
- `submit_report(subject, body_md)` — terminal

Tools are per-agent toggleable; database tools are always on.

**Guardrails**: per-run step cap, token cap, and timeout. Since the customer
pays for their own tokens, caps are safety rails against runaway loops, not
metering. Surface estimated spend per run in the UI.

**Durability**: the worker is a persistent process with a job queue in Postgres.
A crash mid-run marks the run failed and files a failure report rather than
leaving a zombie. No half-written reports.

## 7. BYOK

Self-hosting makes this genuinely clean: **the key never leaves the customer's
infrastructure and we never see it.**

- Entered in Settings after first login, stored encrypted at rest (AES-GCM,
  key derived from a per-instance secret), decrypted only in the worker.
- Masked on display, never returned to the client after save.
- Validated on save with a 1-token ping.
- No key → schedules pause with a clear banner. Agents cannot run.
- Anthropic first (`claude-sonnet-5` default, `claude-opus-5` for hard agents,
  `claude-haiku-4-5-20251001` for cheap high-frequency ones). OpenAI optional
  later.

## 8. Screens

Global layout: left rail with an **agent switcher** at the top (All / per-agent),
then nav: Inbox · Schedules · Database · Agents · Settings. Selecting an agent
scopes every view to it; "All" shows the aggregated view.

1. **Inbox** — reports list (agent avatar, subject, time, unread dot). Detail
   pane renders the markdown with run metadata (duration, steps, tokens, est.
   cost) and a link to the run log. Filters: agent, unread, date.
2. **Schedules** — table across agents (or one): name, cron in plain English,
   next run, last status, enabled toggle. Create/edit drawer: name, task
   prompt, cron builder (presets + raw), timezone. Actions: Run now, Pause,
   Delete.
3. **Database** — table picker for the selected agent, spreadsheet-style grid
   with inline edit, add row, delete row, schema view. Read-only when scoped to
   "All agents".
4. **Agents** — grid of agent cards (name, avatar, status, last run, next run,
   unread count). Create/edit: name, avatar, instructions, model, enabled
   tools, run caps.
5. **Agent detail** — recent runs, its schedules, its tables, its reports, and
   health (failures in last 7 days).
6. **Run detail** — step-by-step log of tool calls and results. Debug surface.
7. **Settings** — API keys, license status, account, timezone, update check.

## 9. MVP Scope

**In:** single-admin auth, agent CRUD, BYOK key storage, cron scheduler,
durable run worker with the built-in toolset, inbox, schedules view, database
view, run log, license check, Railway template + Docker Compose.

**Out of MVP:** `web_search`, custom tools, webhooks, email/Slack delivery of
reports, agent import/export, multi-user invites, hosted edition.

## 10. Tech *(shipped)*

- Next.js 16 (App Router) + TypeScript + Tailwind 4, hand-rolled components
- Postgres + Drizzle, migrations applied automatically on boot
- **Worker: a plain Node process in the same image**, with the `runs` table as
  the job queue (`FOR UPDATE SKIP LOCKED`) and an in-process cron tick. No
  Trigger.dev, no Redis, no external queue — every added vendor breaks the
  one-click promise and adds a signup step between purchase and first report.
- Anthropic SDK with the customer's key
- Auth: `jose` session cookie + Node `scrypt` password hashing — no OAuth vendor
  to configure and no native crypto bindings to compile
- Single Docker image runs `web` and `worker` via `NABU_MODE`

Hard constraint: **the entire app must run from one image plus a Postgres URL.**
Anything requiring the customer to sign up for a third-party service is
disqualified. Two consequences already applied:

- No `next/font/google` — a build-time font fetch breaks offline/CI Docker builds.
- No native dependencies — pure-JS only, so the image builds on any architecture.

### Reliability decisions worth keeping

- **Migrations take a Postgres advisory lock.** Web and worker boot
  simultaneously from the same image; without it they race and one crash-loops.
- **Runs are heartbeated and zombie-reclaimed** after 15 min, so a container
  restart mid-run fails the run cleanly instead of leaving it stuck in `running`.
- **A new schedule arms rather than fires.** A schedule with no `nextRunAt` gets
  its first firing time set on the first tick; otherwise saving a schedule always
  triggers an immediate surprise run.
- **An unparseable cron disables its schedule** instead of being retried forever.
- **API errors are translated to plain English** before reaching a report. The
  raw SDK message is a JSON blob, and the report is the only thing most owners
  will ever read about a failure.

## 11. Success Metrics

Self-hosting means we can't watch usage — metrics come from license pings
(instance count, version, last-seen) plus opt-in anonymous telemetry.

- Purchase → first successful report (self-reported in onboarding survey) < 15 min
- ≥ 80% of licenses activate an instance within 48h of purchase
- ≥ 60% of instances still pinging at day 30
- Support tickets per 100 installs < 10 (the real cost center for self-host)
- Refund rate < 5%

## 12. Open Questions

Ordered by how much they block launch.

1. **How does someone evaluate before buying?** Self-host has no natural free
   trial. Options: a time-limited license key, or one public demo instance we
   host. This is the main friction point in the model and the one place we'd
   end up hosting something.
2. **Do reports need email or Slack delivery in v1?** Self-hosters may not open
   a dashboard daily, which undercuts the inbox. Leaning: add outbound email via
   the customer's own SMTP in v1.1 — no vendor signup, consistent with BYOK.
3. **Does a lapsed Personal license keep working forever?** Leaning yes: it
   works, updates stop.
4. Do we offer a **hosted edition later**? It reintroduces exactly the cron and
   agent-execution costs this model exists to avoid.
5. Do we let users write raw SQL against an agent's tables in the Database view?
6. Per-agent database size caps and report retention.

## 13. Not built yet

Everything in §9 MVP scope is implemented. Still outstanding before selling:

- Publish the image to GHCR and create the Railway template (needs the GHCR
  token entered into Railway's template editor).
- Create the Gumroad product with per-sale license keys, then set
  `NABU_GUMROAD_PRODUCT_ID` at image build time.
- Apply to Railway's Open Source Partner Program for template kickback.
- LICENSE file and purchase/receipt copy.
- A landing page at nabu.sh.
