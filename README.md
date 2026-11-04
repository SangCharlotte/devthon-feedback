# Company X Paints · Customer Feedback

Customers rate us in under a minute. Unhappy customers alert the care team right away.

---

## What you need

- **Docker Desktop**, installed and open: https://www.docker.com/products/docker-desktop
- **Git**

That's it.

---

## Run the app

### 1. Get the code

```sh
git clone <repo-url>
cd devthon-feedback
```

### 2. Make your settings file

```sh
cp .env.example .env
```

Open `.env` and fill in these 3 lines:

```
POSTGRES_PASSWORD=any-password-you-like
ADMIN_PASSWORD=pick-a-password-10-plus-letters
SESSION_SECRET=any-long-random-text-at-least-32-letters-long
```

Leave everything else as it is.

### 3. Start it

```sh
docker compose up --build
```

The first time takes a few minutes. Keep this window open.

### 4. Add sample data (optional)

Open a **second** terminal in the same folder:

```sh
docker compose exec backend python -m app.seed
```

### 5. Open it

| Open this | To see |
|---|---|
| http://localhost:3000 | The customer form |
| http://localhost:3000/admin | The admin dashboard |
| http://localhost:8025 | Emails the app sends |

**Admin login:** username `admin`, password = your `ADMIN_PASSWORD`.

---

## Everyday commands

| To do this | Run this |
|---|---|
| Start | `docker compose up` |
| Start in the background | `docker compose up -d` |
| Stop | `docker compose down` |
| See logs | `docker compose logs -f` |
| Rebuild after code changes | `docker compose up --build` |

---

## Try a text message (no phone needed)

```sh
docker compose exec backend python -m app.simulate_sms 0712345678 "2 1 2 paint peeled"
```

Low scores like this create an alert in the dashboard.

---

## Run the tests

```sh
docker compose exec backend python -m pytest -q
docker compose exec frontend npm test
```

---

## Something wrong?

| Problem | Fix |
|---|---|
| Can't log in | Check `ADMIN_PASSWORD` (10+ letters) and `SESSION_SECRET` (32+ letters) in `.env`, then `docker compose restart backend` |
| "Too many attempts" | `docker compose restart backend` |
| Port already in use | Close other apps using ports 3000, 8000, 5432 or 8025 |
| Changed `.env`, nothing happened | `docker compose restart backend` |
| Want a clean start | `docker compose down -v` (deletes all data), then start again |

---

## Want more?

- AI features, SMS setup and deploying: [DETAILS.md](DETAILS.md)
- 5-minute demo script: [DEMO.md](DEMO.md)
