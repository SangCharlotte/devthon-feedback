# Company X Paints · Customer Feedback

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

With `AI_API_KEY` set, Claude helps the care team. It never acts alone:

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
| http://localhost:3000/admin | Admin dashboard (set `ADMIN_PASSWORD_HASH`, see below) |
| http://localhost:8000/docs | API docs |
| http://localhost:8025 | Mailpit: every email the app sends, caught locally |

Create the admin password hash and put it in `.env`:

```sh
docker compose run --rm --no-deps backend python -m app.auth hash-password
```

That `.env` account is the **owner**: it always works, so the team can't be locked out.
Sign in as the owner and use the dashboard's **Team** card to give every care rep their
own login:

| Role | Can |
|---|---|
| Care rep | Use the dashboard, handle alerts, send replies (signed with their username) |
| Manager | Everything a rep can, plus add people, change roles, reset passwords, deactivate |

Deactivating someone or resetting their password signs them out on every device at once.
People are deactivated, never deleted, so their name stays on the replies they sent.

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
