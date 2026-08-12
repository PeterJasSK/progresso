# Deploying Progresso

Progresso is **host-agnostic** (epic Q5): one Django service serves the DRF API **and** the built React SPA
(via WhiteNoise), and every host/secret value comes from the environment. Vercel and a container host are a
config swap, not a rewrite.

## Environment variables

| Var | Required | Purpose |
|-----|----------|---------|
| `DJANGO_SETTINGS_MODULE` | yes (prod) | `progresso.settings.prod` |
| `SECRET_KEY` | yes | Django secret key |
| `DATABASE_URL` | yes (prod) | Postgres URL, e.g. `postgres://user:pass@host:5432/db` |
| `BLOB_READ_WRITE_TOKEN` | yes (prod) | Vercel Blob token for progress photos |
| `ALLOWED_HOSTS` | yes (prod) | comma-separated hostnames |

Local dev needs none of these — `progresso.settings.dev` supplies an insecure `SECRET_KEY` and falls back to
SQLite + a local-filesystem photo store.

## Build & run (any host)

```sh
# 1. Build the SPA (outputs frontend/dist — WhiteNoise serves it at the site root)
cd frontend && npm ci && npm run build && cd ..

# 2. Python deps
pip install -r requirements.txt

# 3. Static (admin/DRF assets) into STATIC_ROOT
python manage.py collectstatic --noinput

# 4. Database
python manage.py migrate

# 5. Serve
gunicorn progresso.wsgi:application --bind 0.0.0.0:8000
```

## Container host

`Dockerfile` does all of the above in two stages (node build → python runtime):

```sh
docker build -t progresso .
docker run -p 8000:8000 \
  -e SECRET_KEY=... -e DATABASE_URL=postgres://... \
  -e BLOB_READ_WRITE_TOKEN=... -e ALLOWED_HOSTS=your.host \
  -e DJANGO_SETTINGS_MODULE=progresso.settings.prod \
  progresso
```

## Vercel (Vercel Postgres + Blob)

The SPA builds to `frontend/dist` and is served as static from Vercel's CDN; Django runs as a Python
serverless function (`api/index.py`) reached only for `/api`, `/admin`, `/static` (see `vercel.json`
`rewrites`). Vercel Postgres injects `POSTGRES_URL` — `prod.py` maps it to `DATABASE_URL`, uses `conn_max_age=0`
and disables prepared statements (pooler-safe). WhiteNoise serves admin static via finders (no build-time
`collectstatic` needed).

Set env vars in the project (Production): `DJANGO_SETTINGS_MODULE=progresso.settings.prod`, `SECRET_KEY`,
`ALLOWED_HOSTS`, `CSRF_TRUSTED_ORIGINS` (scheme included). `BLOB_READ_WRITE_TOKEN` and `POSTGRES_URL` are
auto-injected when the Blob store and Postgres DB are linked. Run `migrate` + `createsuperuser` yourself
against `POSTGRES_URL_NON_POOLING` (Vercel does not run migrations). Full walkthrough: see the deploy guide.

## Serving model

- `/api/v1/*` → DRF. `/admin/*` → Django admin.
- `/` and client routes → `frontend/dist/index.html` (`progresso/spa.py`).
- `/assets/*`, PWA manifest/service-worker, icons → WhiteNoise from `frontend/dist`.
- Photos → Vercel Blob public URLs (in the measurement payload; no proxy).

## Data files

`db.sqlite3` and `media/` are **local-dev only** and gitignored — never deploy them. Prod runs on Postgres +
Blob.
