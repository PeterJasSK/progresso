# Progresso

Remote personal-training platform. API-first Django + DRF backend.

Core loop: a trainee logs body measurements + a progress photo, a trainer reviews
trends and compares photos, they talk. MVP is that loop only.

## Stack

- Django 5.2 + Django REST Framework (session auth, no JWT in MVP)
- SQLite for local dev, Postgres in prod (via `DATABASE_URL`)
- Host-agnostic: all config via environment variables

## Local setup

```bash
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env                # optional; dev has sane defaults

python manage.py migrate            # creates db.sqlite3 (gitignored)
python manage.py createsuperuser    # for Django /admin/
python manage.py runserver
```

Default settings module is `progresso.settings.dev`. Point
`DJANGO_SETTINGS_MODULE` at `progresso.settings.prod` for production
(requires `SECRET_KEY`, `DATABASE_URL`, `ALLOWED_HOSTS`).

## Auth API (P1)

All under `/api/v1/`. Session-based; register/login/trainers are public.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/auth/register` | public | Self-register (trainee/trainer), auto-login |
| GET  | `/auth/trainers` | public | Trainer list for the signup picker |
| POST | `/auth/login`    | public | Session login |
| POST | `/auth/logout`   | user   | Clear session |
| GET  | `/auth/me`       | user   | Current user; seeds the `csrftoken` cookie |

Access control is a single predicate: `CustomUser.can_access(target)`. Every
DRF permission class consumes it — there are no inline role checks.

Admin lives at `/admin/`, outside the (future) SPA.
