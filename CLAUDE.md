# Progresso — working conventions

Remote personal-training platform. API-first Django + DRF backend, React + Tailwind PWA. Rebuilt from a
monolith (`tasks/plans/epic-progresso-rebuild.md`). MVP = the core loop: *trainee logs measurement + photo →
trainer reviews trends + photo compare → they chat*.

## Architecture

- **Layered layout** (`core/`): `models/`, `api/` (`serializers.py`, `views.py`, `permissions.py`, `urls.py`),
  `services/` (business logic — metrics, chart data, roster, blob, photos).
- **Thin views.** Viewsets/APIViews do wiring only; validation lives in serializers, business logic in
  `services/`. No logic in views. No HTML business logic (SPA is the only client).
- **API-first.** All app data through DRF JSON at `/api/v1/`. Admin stays in Django `/admin/`.

## Hard rules

- **One authorization predicate.** `CustomUser.can_access(target)` is the single source of access truth; DRF
  permission classes consume it. `accessible_data_filter()` is its queryset mirror. Chat uses the symmetric
  `can_communicate_with()`. Never write an inline `if role ==` data-access check anywhere else.
- **No raw SQL.** Django ORM only (`annotate`/`prefetch_related`/`Q`).
- **Strict types.** `from __future__ import annotations` at the top of every module; full type hints; PEP 8.
- **No hardcoded secrets/hosts.** Everything host-specific from env vars (`SECRET_KEY`, `DATABASE_URL`,
  `BLOB_READ_WRITE_TOKEN`, `ALLOWED_HOSTS`). See `DEPLOY.md`.
- **Error bodies are translation keys, not prose.** Serializers/views return keys (e.g. `invalid_trainer`,
  `empty_message`); the SPA localizes via `t('errors.<key>')`.
- **i18n from day one.** EN base + complete SK parallel catalogs (`frontend/src/i18n/`). No hardcoded UI
  strings in components. Numbers/dates in JetBrains Mono; design tokens are the single source (no hardcoded
  hex).
- **No data files in git.** `db.sqlite3` + `media/` are gitignored (local-dev only); Postgres + Blob in prod.

## Testing & tooling

- **No automated tests, no CI test gate, no Sentry** (developer decision, epic §3). Verify manually: run the
  app, `curl` the endpoints, exercise the flows in each plan's verification section. `can_access` is
  **manually verified**, kept as one predicate so it stays auditable by eye.
- Backend check: `python manage.py check` + `python manage.py makemigrations --check`.
- Frontend build: `cd frontend && npm run build` (tsc strict + Vite + PWA).

## Workflow

- Feature plans live in `tasks/plans/`; each is the implementation contract. Work through §6 File Plan
  layer-by-layer, mirror existing patterns.
- Commit format: `#<num> <summary>` (e.g. `#p8 chat + hardening + deploy`). No `Co-Authored-By` lines.
- Branch: the rebuild (P5–P8) ships on `main`.
