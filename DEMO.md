# Demo script (5 minutes)

Each step names the part of the brief it proves. Practise it twice end to end.

## Before the judges arrive (10 minutes earlier)

```sh
docker compose up -d                                  # everything running?
docker compose ps                                     # all "healthy" / "running"
docker compose exec backend python -m app.seed        # fresh, realistic demo data
docker compose exec backend python -m app.services.ai_tagging   # tag the comments
docker compose restart backend                        # clears any login lockout
```

Open these tabs, in this order:

1. http://localhost:3000 on your **phone** (same Wi-Fi: `http://<your-PC-IP>:3000`), or a
   desktop browser in phone view (F12, then the phone icon)
2. http://localhost:3000/admin, signed in as the owner
3. http://localhost:8025 (Mailpit: the care team's inbox)
4. A terminal in the project folder (for the SMS step)
5. Your GitHub repo's **Actions** tab, showing a green pipeline run

Have a care-rep account ready (Team card) so you can show signing in as a rep.

## The script

| Time | Do | Say (the brief section it covers) |
|---|---|---|
| 0:00 | Show the phone form | "Paint buyers rate us from their phone in under a minute. No app." (§03, §07) |
| 0:20 | Tap faces: **Poor, Terrible, Poor**. Fill in name, email and phone. Submit | "The faces react as you tap, three screens, then a thank-you panel." (§13) |
| 0:50 | Point at the thank-you panel | "The customer just gets a thank-you and a promise that someone will be in touch. We never call them a detractor." |
| 1:00 | Switch to the dashboard: the toast pops up, and the alert is at the top of **Needs follow-up** showing **1.67** | "(2+1+2)/3 = 1.67, below 3, so a **detractor** (§08). The care rep is notified in the dashboard, with name and email..." (§09) |
| 1:15 | Switch to Mailpit | "...and by email, at the same moment." (§09) |
| 1:30 | In the terminal: `docker compose exec backend python -m app.simulate_sms 0712345678 "4 5 4"` | "Painters on feature phones just text back three digits. This sends exactly what Africa's Talking sends us." (§02, §11) |
| 1:50 | Dashboard: the new **SMS** row appears in the log | "No app, no data bundle." |
| 2:00 | Big total, trend line with the dashed projection, donut | "Total respondents, the daily trend with a 7-day projection, and the split." (§10) |
| 2:30 | Search the log for a name and open their row | "Every person's 1–5 per question, searchable." (§10) |
| 2:50 | **Summarise the last 30 days** | "One-click plain-English summary." Say clearly that **this is demo mode** if you have no key. (§12) |
| 3:10 | On the alert: **Draft a reply**, edit a line, **Send email**, show it in Mailpit | "AI drafts, the rep edits and clicks send: human in the loop." (§12 rule 02) |
| 3:40 | Team card: show the rep account, then **Deactivate** | "Every rep signs in as themselves. Replies are signed. Deactivating someone signs them out instantly." |
| 4:00 | Theme toggle (sun/moon) | "Paint-inspired styling, light and dark." (§13) |
| 4:15 | GitHub Actions run | "Lint, tests, Docker build, dependency and secret scans, migrations, auto-deploy to staging, and production waits for a manager to approve." (§06) |
| 4:45 | Wrap up | "Feedback still saves if the AI or email is down. Keys live only in the backend `.env`." (§12 rules 03 and 04) |

## If something goes wrong

| Problem | Fix |
|---|---|
| "Too many failed logins" | `docker compose restart backend` (the counts live in memory) |
| The dashboard says "Your session has ended" | Sign in again. Someone changed or deactivated that account. |
| No toast appears | The dashboard checks every 20 s. Wait, or reload. |
| AI summary fails | Say: "rule 03, the AI fails gracefully", then show that the feedback still saved |
| The phone can't reach the PC | Use the desktop browser's phone view instead |
| Nothing loads | `docker compose up -d`, then wait for `docker compose ps` to show healthy |

## Questions judges are likely to ask

- **Where is the API key?** In the backend's `.env` only (git-ignored and kept out of Docker
  images). The browser calls our API; the API calls the AI. Nothing secret ships to React.
- **What if the AI is down?** Feedback saves first; tagging runs afterwards in the background
  and never raises. The summary and draft buttons show an error inside their card.
- **Is the SMS real?** It uses the Africa's Talking sandbox. With a sandbox key in `.env`,
  invites go out and the AT simulator phone receives them. For live replies, Africa's
  Talking needs a public callback URL (the deployed server, or a tunnel like ngrok). Today
  we use `simulate_sms`, which posts the same request Africa's Talking would.
- **Why is exactly 3.00 passive?** The brief says so. We compare the exact mean, with no
  rounding, so 2.67 is a detractor and 3.33 a promoter (tested).
- **What stops password guessing?** Five failures per IP in 15 minutes, 20 per username,
  then `429` with `Retry-After`. Caddy overwrites forged `X-Forwarded-For` headers.
- **How do you roll back?** Re-run an earlier production deploy. Images are tagged by commit
  and kept, so it redeploys exactly that version.
