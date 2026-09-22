# API Contract Spec — Trip Planner

> The binding contract between `frontend-spec.md` and `backend-spec.md`. Both sides must implement to this exactly — treat it as the source of truth for request/response shapes.

## 1. Conventions
<!-- Base URL, versioning scheme (e.g. /api/v1), content type, date/time format, pagination style, naming case (camelCase/snake_case). -->
- **Base URL:** `https://<api-domain>/api/v1` (production domain TBD — behind the ALB from `backend-spec.md`). Frontend reads it from `VITE_API_BASE_URL` (`frontend-spec.md` §10).
- **Versioning:** URL-prefixed, `/api/v1`.
- **Content-Type:** `application/json` for all requests and responses.
- **Date/time format:** ISO 8601. Plain dates (`start_date`, `end_date`, `date`) as `YYYY-MM-DD`; timestamps (`created_at`) as `YYYY-MM-DDTHH:MM:SSZ` (UTC).
- **Naming case:** `snake_case` for all JSON field names, matching the Python/Pydantic/SQLAlchemy field names directly — no alias/conversion layer.
- **Pagination:** none for MVP — `GET /trips` returns the full list (personal-scale usage per `backend-spec.md` §7).
- **Auth header:** `Authorization: Bearer <jwt>` on every request except `POST /auth/login`.

## 2. Authentication
<!-- How the client authenticates requests (Bearer token, cookie/session, etc.). Include login/signup/refresh endpoints here or in section 4. -->
JWT bearer tokens (`backend-spec.md` §5). The client authenticates once via `POST /auth/login` or `POST /auth/signup`, gets back an `access_token`, and sends it as `Authorization: Bearer <access_token>` on every subsequent request. No refresh-token endpoint in MVP — a token is valid for `expires_in` seconds (30 days) from issuance, at which point the client must log in again. See §4 for the exact request/response shapes.

## 3. Common Response Envelope & Error Format
<!-- Standard success/error JSON shape, HTTP status code conventions, error codes list. -->
No wrapper envelope — a successful response body *is* the resource (object or array), matching FastAPI/Pydantic defaults directly (`backend-spec.md` §8).
```json
// Success (e.g. GET /trips/{id})
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "destination": "Kyoto, Japan",
  "start_date": "2026-10-01",
  "end_date": "2026-10-03",
  "trip_type": "couple",
  "created_at": "2026-09-16T10:00:00Z",
  "days": []
}

// Error (400 / 401 / 404 / 500)
{
  "detail": "end_date must be on or after start_date"
}

// Error (422 — request-shape validation, FastAPI's default shape)
{
  "detail": [
    { "loc": ["body", "destination"], "msg": "field required", "type": "value_error.missing" }
  ]
}
```

## 4. Endpoints
<!-- One entry per endpoint. Copy the block below for each. -->

### `POST /auth/login`
- **Description:** Authenticate with username/password and receive a JWT.
- **Auth required:** no
- **Path params:** none
- **Query params:** none
- **Request body:**
```json
{ "username": "deepak", "password": "hunter2" }
```
- **Response `200`:**
```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in": 2592000,
  "username": "deepak"
}
```
- **Error responses:** `401` invalid credentials · `422` missing/malformed fields

---

### `POST /auth/signup`
- **Description:** Create a username/password account. Logs the new user in immediately (same response shape as login).
- **Auth required:** no
- **Path params:** none
- **Query params:** none
- **Request body:**
```json
{ "username": "deepak", "password": "hunter2" }
```
- **Response `201`:**
```json
{
  "access_token": "eyJhbGciOi...",
  "token_type": "bearer",
  "expires_in": 2592000,
  "username": "deepak"
}
```
- **Error responses:** `400` username already taken · `422` missing/malformed fields

---

### `GET /trips`
- **Description:** List the authenticated user's trips (summaries — no days/activities).
- **Auth required:** yes
- **Path params:** none
- **Query params:** none
- **Request body:** none
- **Response `200`:**
```json
[
  {
    "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    "destination": "Kyoto, Japan",
    "start_date": "2026-10-01",
    "end_date": "2026-10-03",
    "trip_type": "couple",
    "created_at": "2026-09-16T10:00:00Z"
  }
]
```
- **Error responses:** `401` missing/invalid token

---

### `POST /trips`
- **Description:** Create a trip. The backend auto-generates its `days` (Day 1..N, one per date in range) — the client does not submit days.
- **Auth required:** yes
- **Path params:** none
- **Query params:** none
- **Request body:**
```json
{
  "destination": "Kyoto, Japan",
  "start_date": "2026-10-01",
  "end_date": "2026-10-03",
  "trip_type": "couple"
}
```
- **Response `201`:**
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "destination": "Kyoto, Japan",
  "start_date": "2026-10-01",
  "end_date": "2026-10-03",
  "trip_type": "couple",
  "created_at": "2026-09-16T10:00:00Z",
  "days": [
    { "id": "d1...", "day_number": 1, "date": "2026-10-01", "activities": [] },
    { "id": "d2...", "day_number": 2, "date": "2026-10-02", "activities": [] },
    { "id": "d3...", "day_number": 3, "date": "2026-10-03", "activities": [] }
  ]
}
```
- **Error responses:** `400` `end_date` before `start_date` · `401` · `422` missing/malformed fields or invalid `trip_type`

---

### `GET /trips/{trip_id}`
- **Description:** Get one trip's full detail, including its itinerary (days + activities).
- **Auth required:** yes
- **Path params:** `trip_id` (UUID)
- **Query params:** none
- **Request body:** none
- **Response `200`:**
```json
{
  "id": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  "destination": "Kyoto, Japan",
  "start_date": "2026-10-01",
  "end_date": "2026-10-03",
  "trip_type": "couple",
  "created_at": "2026-09-16T10:00:00Z",
  "days": [
    {
      "id": "d1...",
      "day_number": 1,
      "date": "2026-10-01",
      "activities": [
        { "id": "a1...", "text": "Visit Fushimi Inari", "sort_order": 0, "created_at": "2026-09-16T10:05:00Z" }
      ]
    }
  ]
}
```
- **Error responses:** `401` · `404` trip not found or not owned by the caller

---

### `DELETE /trips/{trip_id}`
- **Description:** Delete a trip. Cascades to its days and activities.
- **Auth required:** yes
- **Path params:** `trip_id` (UUID)
- **Query params:** none
- **Request body:** none
- **Response `204`:** no body
- **Error responses:** `401` · `404` trip not found or not owned by the caller

---

### `POST /trips/{trip_id}/days/{day_id}/activities`
- **Description:** Add an activity to one of a trip's days.
- **Auth required:** yes
- **Path params:** `trip_id` (UUID), `day_id` (UUID)
- **Query params:** none
- **Request body:**
```json
{ "text": "Visit Fushimi Inari" }
```
- **Response `201`:**
```json
{ "id": "a1...", "text": "Visit Fushimi Inari", "sort_order": 0, "created_at": "2026-09-16T10:05:00Z" }
```
- **Error responses:** `400` empty/whitespace-only text · `401` · `404` trip or day not found, not owned by the caller, or `day_id` doesn't belong to `trip_id`

---

### `PATCH /activities/{activity_id}`
- **Description:** Edit an activity's text.
- **Auth required:** yes
- **Path params:** `activity_id` (UUID)
- **Query params:** none
- **Request body:**
```json
{ "text": "Visit Fushimi Inari at sunrise" }
```
- **Response `200`:**
```json
{ "id": "a1...", "text": "Visit Fushimi Inari at sunrise", "sort_order": 0, "created_at": "2026-09-16T10:05:00Z" }
```
- **Error responses:** `400` empty/whitespace-only text · `401` · `404` activity not found or not owned by the caller

---

### `DELETE /activities/{activity_id}`
- **Description:** Delete an activity.
- **Auth required:** yes
- **Path params:** `activity_id` (UUID)
- **Query params:** none
- **Request body:** none
- **Response `204`:** no body
- **Error responses:** `401` · `404` activity not found or not owned by the caller

---

## 5. Data Schemas
<!-- Shared object shapes referenced across endpoints (e.g. Trip, Destination, ItineraryItem, User). Keep field names/types consistent with backend-spec.md's data model. -->

### `TripType` (enum)
`"solo"` | `"couple"` | `"family"` | `"group_of_friends"`

### `TripSummary`
<!-- Returned by GET /trips -->
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | yes | |
| destination | string | yes | |
| start_date | string (date) | yes | `YYYY-MM-DD` |
| end_date | string (date) | yes | `YYYY-MM-DD`, ≥ `start_date` |
| trip_type | `TripType` | yes | |
| created_at | string (datetime) | yes | |

### `Trip`
<!-- Returned by POST /trips, GET /trips/{trip_id} — TripSummary fields + days -->
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | yes | |
| destination | string | yes | |
| start_date | string (date) | yes | |
| end_date | string (date) | yes | |
| trip_type | `TripType` | yes | |
| created_at | string (datetime) | yes | |
| days | `Day[]` | yes | ordered by `day_number` ascending |

### `Day`
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | yes | |
| day_number | integer | yes | 1..N |
| date | string (date) | yes | |
| activities | `Activity[]` | yes | ordered by `sort_order` ascending |

### `Activity`
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| id | string (UUID) | yes | |
| text | string | yes | non-empty, trimmed |
| sort_order | integer | yes | |
| created_at | string (datetime) | yes | |

### `LoginRequest` / `SignupRequest`
<!-- Same shape for both POST /auth/login and POST /auth/signup -->
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| username | string | yes | |
| password | string | yes | |

### `AuthResponse`
<!-- Same shape for both POST /auth/login and POST /auth/signup -->
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| access_token | string | yes | JWT |
| token_type | string | yes | always `"bearer"` |
| expires_in | integer | yes | seconds until the token expires (2,592,000 = 30 days) |
| username | string | yes | so the frontend can display "logged in as ..." and persist it in `localStorage` (`frontend-spec.md` §5) without decoding the JWT |

### `CreateTripRequest`
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| destination | string | yes | |
| start_date | string (date) | yes | |
| end_date | string (date) | yes | ≥ `start_date` |
| trip_type | `TripType` | yes | |

### `CreateActivityRequest` / `UpdateActivityRequest`
| Field | Type | Required | Notes |
|-------|------|----------|-------|
| text | string | yes | non-empty after trimming |

## 6. Status Code Reference
| Code | Meaning |
|------|---------|
| 200  | OK |
| 201  | Created |
| 204  | No Content (successful delete) |
| 400  | Business-rule validation error (e.g. bad date range, empty activity text, username already taken) |
| 401  | Missing, invalid, or expired token; or bad login credentials |
| 404  | Not found — including a resource that exists but belongs to another user (never `403`, to avoid confirming it exists) |
| 422  | Request-shape validation error (missing/malformed field) |
| 500  | Unhandled server error |

## 7. Open Questions
_None currently — all resolved:_
- `username` is persisted in `localStorage` alongside the token (`frontend-spec.md` §5), not decoded from the JWT.
- `404` (not `403`) confirmed for other users' resources — kept as the one "not accessible" status.
- No day-level endpoints — days are only ever read/written as part of the full `Trip`; confirmed sufficient.
