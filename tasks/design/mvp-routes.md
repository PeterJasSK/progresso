# Trener App — MVP Routes & User Journeys

> Defines the MVP scope as concrete routes: **frontend screens** (what a person navigates) and the **API endpoints** behind them. Organized by who uses them and why. Anything not listed here is post-MVP.

---

## MVP scope line

**In:** auth, trainee measurement+photo capture, trainer views trends + photo compare, roster, basic goals, basic chat.
**Out (post-MVP):** training plans, offline queue, push notifications, realtime chat, derived body-fat, assistant-trainer management, audit log.

The MVP is the core loop only: *trainee logs data → trainer reviews progress → they talk.*

---

## Actors

- **Trainee** — logs own measurements/photos, sees own trends, chats with trainer.
- **Trainer** — sees own trainees, reviews their data, adds trainees, chats.
- **Admin** — Django admin (`/admin/`), not part of the SPA.

---

## A. Frontend screens (SPA/PWA routes)

What a person actually navigates. Path → screen → who → purpose.

### Shared / auth
| Path | Screen | Who | Purpose |
|------|--------|-----|---------|
| `/login` | Login | all | sign in |
| `/logout` | (action) | all | sign out |
| `/` | Redirect | all | send to role home |

### Trainee journey
| Path | Screen | Purpose |
|------|--------|---------|
| `/me` | Trainee home | latest measurement, trend snapshot, next-action ("log this week") |
| `/me/measurements` | My measurements | list of all my entries, newest first |
| `/me/measurements/new` | **Log measurement** | the core capture form: numbers + photo. Mobile-first. |
| `/me/measurements/:id` | Measurement detail | single entry + photo |
| `/me/progress` | My progress | charts over time (weight, chest, waist, …) |
| `/me/goals` | My goals | list + add goal |
| `/me/chat` | Chat with trainer | conversation thread |

### Trainer journey
| Path | Screen | Purpose |
|------|--------|---------|
| `/trainer` | Trainer home / roster | all my trainees, last-measurement date, overdue flag |
| `/trainer/trainees/new` | Add trainee | create trainee account |
| `/trainer/trainees/:id` | Trainee overview | that trainee's summary + quick links |
| `/trainer/trainees/:id/measurements` | Their measurements | list |
| `/trainer/trainees/:id/progress` | Their charts | trends over time |
| `/trainer/trainees/:id/photos` | **Photo compare** | pick dates, side-by-side (later: overlay) |
| `/trainer/trainees/:id/goals` | Their goals | view/toggle complete |
| `/trainer/trainees/:id/chat` | Chat with trainee | conversation thread |

**Note:** trainee cannot reach any `/trainer/*` route; trainer cannot log measurements (only trainees create them). Enforced by the API, not just the UI.

---

## B. API endpoints (DRF, `/api/v1/`)

Backs the screens above. All non-auth endpoints require authentication; every one runs through the single `can_access` permission predicate.

### Auth
| Method | Path | Who | Notes |
|--------|------|-----|-------|
| POST | `/api/v1/auth/login` | all | returns token/session + role |
| POST | `/api/v1/auth/logout` | all | |
| GET | `/api/v1/auth/me` | all | current user + role (frontend bootstraps from this) |

### Users / roster
| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/api/v1/trainees` | trainer | my roster (last-measurement date, overdue flag) |
| POST | `/api/v1/trainees` | trainer | create a trainee under me |
| GET | `/api/v1/trainees/:id` | trainer(owns) | one trainee summary |
| PATCH | `/api/v1/trainees/:id` | trainer(owns) | edit basic info |
| DELETE | `/api/v1/trainees/:id` | trainer(owns) | remove trainee (cascades; cleans blobs) |

### Measurements (core loop)
| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/api/v1/measurements?user=:id` | owner trainee, or trainer(owns) | list; trainee omits `user` = self |
| POST | `/api/v1/measurements` | trainee | create own (multipart: numbers + photo) |
| GET | `/api/v1/measurements/:id` | owner or trainer(owns) | one entry |
| PATCH | `/api/v1/measurements/:id` | owner trainee | edit own recent entry |
| DELETE | `/api/v1/measurements/:id` | owner trainee | delete own (removes blob) |
| GET | `/api/v1/measurements/series?user=:id` | owner or trainer(owns) | chart series: dates + per-metric arrays |

### Photos (compare)
| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/api/v1/measurements/photos?user=:id` | owner or trainer(owns) | measurements that have a photo, for the compare picker |

(Photo bytes served from Blob public URL returned in the measurement payload — no proxy endpoint needed in MVP.)

### Goals
| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/api/v1/goals?user=:id` | owner or trainer(owns) | list |
| POST | `/api/v1/goals` | trainee | add own goal |
| PATCH | `/api/v1/goals/:id` | owner, or trainer(owns) toggle-complete | update / mark complete |

### Chat
| Method | Path | Who | Purpose |
|--------|------|-----|---------|
| GET | `/api/v1/messages?with=:userId&since=:ts` | either party | thread; `since` for incremental poll (no full re-fetch) |
| POST | `/api/v1/messages` | either party | send `{to, content}` |
| POST | `/api/v1/messages/read` | receiver | mark thread read once (not every poll) |

---

## C. Route-level permission rules (the whole point)

Every endpoint resolves access through one predicate:

- **trainee** → only rows where `user == self`. Cannot pass another `user` id.
- **trainer** → only trainees where `head_trainer == self` (helper access is post-MVP).
- **create measurement/goal** → trainee only, always `user = self`.
- **create trainee / roster** → trainer only.
- **chat** → both parties must be in an allowed trainer↔trainee relationship.
- **admin** → Django `/admin/` only, outside the API.

Test matrix (must be green before MVP ships): `{trainee, trainer, other-trainer} × {own data, other's data} → {200, 403}` for measurements, goals, photos, chat.

---

## D. MVP journey walkthroughs (sanity check the routes above)

**Trainee weekly log:**
`/login` → `/me` (sees "log this week") → `/me/measurements/new` → fill numbers + snap photo → POST `/api/v1/measurements` → back to `/me/measurements`.

**Trainer progress review:**
`/login` → `/trainer` (roster, spots overdue/updated trainee) → `/trainer/trainees/:id/progress` (charts) → `/trainer/trainees/:id/photos` (compare two dates) → `/trainer/trainees/:id/chat` (send feedback).

**Onboarding a client:**
Trainer `/trainer/trainees/new` → POST `/api/v1/trainees` → trainee gets credentials → trainee `/login` → `/me`.

If a route isn't touched by one of these three journeys, it's not MVP.
