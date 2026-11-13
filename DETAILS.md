# Company X Paints · Customer Feedback (full details)

> New here? Start with the short guide in [README.md](README.md).

A feedback system that paint customers finish in under a minute: on a smartphone
(animated smiley questionnaire) or a basic feature phone (reply to an SMS with `4 5 4`).
Unhappy customers trigger an instant alert to the care team, and the admin dashboard
shows the trends.

| Part | Stack |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript (questionnaire + admin dashboard) |
| Backend | FastAPI, SQLAlchemy 2, Alembic, Pydantic |
| Database | PostgreSQL 16 |
| SMS | Africa's Talking (sandbox) |
| CI/CD | GitHub Actions → GHCR images → staging → approved production |

## Scoring

The mean of the three answers decides the category: **below 3** is a detractor (an alert
is raised: an email to the care team, a dashboard notification and an optional SMS), **exactly 3** is
passive, **above 3** is a promoter. Example: (2 + 3 + 2) / 3 = 2.33, so it's a detractor.

## AI assistance (optional)

With `AI_API_KEY` set, an LLM helps the care team. `AI_PROVIDER` picks OpenAI
(default model `gpt-5.4-mini`) or Anthropic Claude; both get the same prompts and
return the same validated JSON shapes. It never acts alone:

| Feature | When it runs | Human in the loop |
|---|---|---|
| Sentiment + topic tags on comments | In the background, after feedback is saved | Tags are labelled as AI output in the log |
| Plain-English summary of the period | When an admin clicks **Summarise** | It's a briefing to read, with a note on how many comments it covered |
| Reply drafts for unhappy customers | When a rep clicks **Draft a reply** | The draft lands in an editable box; only the rep's **Send** emails the customer |

If the AI is off, slow or failing, feedback still saves and alerts still go out. Only
comments and scores (plus a first name for drafts) are sent to the AI, never emails or phone numbers.
Backfill tags for older comments: `docker compose exec backend python -m app.services.ai_tagging`.

## Run it locally

Presenting? See [DEMO.md](DEMO.md) for a 5-minute script and a backup plan.

Requires Docker Desktop.

```sh
cp .env.example .env          # then fill in the blanks (see comments inside)
docker compose up --build
docker compose exec backend python -m app.seed   # optional: 60 days of sample data
```

| URL | What |
|---|---|
| http://localhost:3000 | Customer questionnaire |
| http://localhost:3000/admin | Admin dashboard (sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD` from `.env`) |
| http://localhost:8000/docs | API docs |
| http://localhost:8025 | Mailpit: every email the app sends, caught locally |

Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `.env`. On every startup the backend
stores that account in the database as a manager, with the password hashed (scrypt).
To change the password, edit `.env` and restart the backend; old owner sessions end.

That `.env` account is the **owner**: it always works, so the team can't be locked out.
The dashboard can't deactivate, demote or reset it; `.env` is its only source of truth.
Sign in as the owner and use the dashboard's **Team** card to give every care rep their
own login:

| Role | Can |
|---|---|
| Care rep | Use the dashboard, handle alerts, send replies (signed with their username) |
| Manager | Everything a rep can, plus add people, change roles, reset passwords, deactivate |

Deactivating someone or resetting their password signs them out on every device at once.
People are deactivated, never deleted, so their name stays on the replies they sent.

## SMS and USSD with the Africa's Talking sandbox

Painters on feature phones can answer two ways, with no app and no data bundle:

| Channel | How the painter answers | Callback |
|---|---|---|
| SMS | The care team texts an invite from **Customers → Invite a painter**. The painter replies `4 5 4`, optionally followed by a comment. | `POST /sms/inbound` |
| USSD | The painter dials the service code and answers three 1–5 menus, then an optional comment. A wrong key re-asks the question. | `POST /ussd` |

Both callbacks check `?token=<AT_WEBHOOK_TOKEN>`. Both save the answer as a painter's
response, raise a detractor alert and tag the comment with AI, the same as the web form.

**One-time setup in the sandbox** (at account.africastalking.com, open the sandbox app):

1. Give the backend a public HTTPS URL, for example `ngrok http 8000` (or the port your
   backend listens on). The URLs below call it `https://PUBLIC`.
2. **SMS → Shortcodes:** create a shortcode, then set `AT_SENDER_ID` to it in `.env`. Invites
   are sent from it, so the simulator's replies come back to it.
3. **SMS → SMS Callback URLs → Incoming Messages:** `https://PUBLIC/sms/inbound?token=<AT_WEBHOOK_TOKEN>`.
4. **USSD → Create Channel:** pick a code and set the callback to
   `https://PUBLIC/ussd?token=<AT_WEBHOOK_TOKEN>`. Then set `AT_USSD_CODE` in `.env`.
5. Restart the backend so it reads the new `.env` values.

**Try it:** open simulator.africastalking.com and launch a phone with a number such as
`+254711000555`. Send that number an invite from the dashboard: it appears in the
simulator's SMS inbox, and replying `4 5 4` records feedback. Or dial the USSD code.

**Without a public URL** (offline demos), the same paths can be run from inside the stack:

```sh
docker compose exec backend python -m app.simulate_sms 0712345678 "2 1 2 the paint peeled"
docker compose exec backend python -m app.simulate_ussd 0712345678 4 5 4 "great coverage"
```

## Tests and checks

```sh
docker compose exec backend python -m pytest -q
docker compose exec backend python -m ruff check .
docker compose exec frontend npm test
docker compose exec frontend npm run lint
docker compose exec frontend npm run typecheck
```

## Pipeline

```
PR ─► 02 Lint ─► 03 Test ─► 04 Build images ─┐
      05 Scan (deps + secrets) ──────────────┼─► 07 Staging ─► 08 Production
      06 Migrate (up / check / down / up) ───┘    (auto)        (manager approves)
```

Pull requests run steps 02–06. Merging to `main` also pushes the images to GHCR,
tagged with the commit SHA, and deploys that same image to staging and then production.

### One-time setup

1. **Protect `main`**: Settings → Branches → require a pull request and the Pipeline checks to pass.
2. **Servers**: any Linux machine with Docker. On each one, create `~/feedback/.env`
   from [`deploy/.env.example`](deploy/.env.example), using different secrets for staging and production.
3. **Environments**: Settings → Environments → create `staging` and `production`, each with:
   - secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (a dedicated deploy key) and
     `DEPLOY_KNOWN_HOSTS` (output of `ssh-keyscan <host>`)
   - variable `SITE_URL`, e.g. `https://staging.companyx.example`
   - on **production** only: **Required reviewers**. This is the manual approval gate.
4. Repository variable `DEPLOY_ENABLED=true` (Settings → Variables) turns on steps 07–08.

**Rollback:** re-run the production job of an earlier successful pipeline run. Images are
kept per commit, so it redeploys exactly that version.

## Security notes

- Secrets live only in `.env` files on each machine (git-ignored). The browser never sees an
  API key, and the AI and SMS keys are only used by the backend.
- Sessions use an HttpOnly, SameSite cookie. Passwords are stored as scrypt hashes.
- Every request re-checks the account: a token is refused once its owner is deactivated or
  their password changes (each account has a `session_version` copied into its tokens).
- Only Caddy (ports 80/443) is exposed in production. Postgres and the API stay on the
  private Docker network.
- Customer comments are treated as untrusted data in AI prompts, and AI replies are never sent without review.
- Login is rate limited: 5 failed attempts per visitor IP (or 20 per username, from any
  IP) in 15 minutes returns `429 Too Many Requests` with a `Retry-After` header. The real
  visitor IP comes from `X-Forwarded-For`, believed only from `TRUSTED_PROXIES` (Caddy and
  Next.js on the private Docker network); Caddy replaces any forged value.
- In local dev there is no Caddy, so all logins through Next.js share one counter. If you
  lock yourself out, `docker compose restart backend` clears it (the counts live in memory).
