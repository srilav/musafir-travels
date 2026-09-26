# Musafir Travels — Frontend

React + TypeScript single-page app for planning trips day by day. It talks to the FastAPI backend at `/api/v1`. The binding specs are in `../specs_with_AI_feature/`: `frontend-spec.md`, `api-contract-spec.md`, `AI-spec.md` and `goal-spec.md`.

**Stack:** Vite, React 19, TypeScript, Tailwind CSS v4 (design tokens in `tailwind.config.js`, loaded with `@config`), React Router, TanStack React Query, and `jspdf` for client-side PDF export. Tests use Vitest, Testing Library and jsdom. Linting uses oxlint.

## Setup

Requires Node 22+ and npm.

```bash
npm install
cp .env.example .env.local   # then edit if your backend runs elsewhere
npm run dev                  # http://localhost:5173
```

## Environment

| Variable | Example | Notes |
|----------|---------|-------|
| `VITE_API_BASE_URL` | `http://localhost:8000/api/v1` | The backend base URL, including `/api/v1`. It's baked in at build time, so set it for each Vercel environment and redeploy after you change it. In production it must be the HTTPS CloudFront URL. |

The frontend never calls the AI provider directly and holds no provider credentials. All AI requests go through `POST /ai/trip-draft` on the backend.

## Scripts

| Script | What it does |
|--------|--------------|
| `npm run dev` | Starts the Vite dev server |
| `npm run build` | Type-checks (`tsc -b`, which includes the tests) and builds to `dist/` |
| `npm run preview` | Serves the production build |
| `npm run lint` | Runs oxlint (React, a11y and Vitest rules); warnings fail the run |
| `npm test` | Runs the Vitest suite once (jsdom, mocked `fetch`) |
| `npm run test:watch` | Runs Vitest in watch mode |
| `npm run typecheck` | Type-checks only |

## Structure

```
src/
  main.tsx, App.tsx        providers and routes
  config.ts                VITE_API_BASE_URL
  api/                     fetch client (ApiError/NetworkError, 401 handler), React Query hooks, AI transport + response validation
  auth/                    AuthContext (token and username in localStorage), ProtectedRoute
  pages/                   Login, Signup, Home, NewTrip, TripItinerary
  components/              AppShell, TripListItem, NewTripForm, TripChat, TripDraftReview, TripFields,
                           DayPlanner, ActivityInput, PrintButton, DeleteTripButton, ...
  lib/                     dates, draft validation, confirmation matcher, limits, draft storage, PDF builder
  types/                   contract types that mirror api-contract-spec §5 (snake_case)
  test/                    test setup and helpers
```

**Deployment:** `vercel.json` rewrites every path to `index.html` so client-side routes still load after a refresh.

## How the conversational trip entry works (`/trips/new`)

- **Chat first, manual always available.** The page opens on "Describe your trip". An "Enter details manually" button is always visible, including while a reply is loading and after an error.
  - Switching to manual mode keeps the values extracted so far. It never preselects a trip type.
  - Switching back to chat starts a fresh conversation. It keeps only the valid fields and takes a new date context.
- **Each turn** sends `{messages, draft, reference_date, timezone}` to `POST /ai/trip-draft`.
  - `reference_date` is the local `YYYY-MM-DD` date and `timezone` is the IANA zone. Both are captured when the conversation starts and stay fixed until you restart.
  - The draft you send is the current form, including your manual edits.
  - The opening prompt and other UI notices are never sent to the AI.
- **Stale responses are ignored.** Every turn gets a version number and an `AbortController`. Editing a field, switching mode, restarting, discarding the draft or leaving the page cancels the pending turn. A response that arrives late is then ignored.
- **Review.** `TripDraftReview` shows editable fields with markers (Missing, Needs clarification, Not provided yet, or a validation error). When everything is complete, it also shows a summary with written-out dates (for example "3 April 2027 – 5 April 2027") and a readable trip type.
- **Confirmation.**
  - When a reply produces a complete, validated draft, the app stores that exact draft as the pending confirmation. It then asks: "Shall I create this trip? Reply yes to confirm, or tell me what to change."
  - Replies are matched as standalone phrases (`src/lib/confirmation.ts`) after ignoring case, whitespace and punctuation. There is no substring matching, so "yes, but change the dates" goes to the AI as a correction.
  - A recognised confirmation is used once and submits the stored draft without another AI request.
  - A manual edit, a new AI turn, a mode switch or a restart clears the pending confirmation.
- **Creating the trip.**
  - The chat confirmation and the "Create trip" button use the same guarded `submitCreate` handler. A synchronous ref stops a second submission.
  - A creation-in-progress marker is saved before the request goes out. The app navigates only after a `201`.
  - A network failure, `502` or `504` gives an uncertain outcome: you're asked to check your trips list, and the request is never retried automatically.
- **Limits** (`src/lib/limits.ts`), counted in Unicode code points:
  - 2,000 characters per message, with a live counter.
  - 12,000 characters in total per request, including the new message.
  - At most 19 messages per request, which keeps the conversation within 20 once the reply arrives.
  - Sends over a limit are blocked and your typed text is kept. At the history or total-size limit you can complete the trip manually or restart. History is never truncated.
- **Errors.**
  - `422`: an inline message.
  - `429`: sending is disabled for the `Retry-After` period, with a countdown.
  - `502`, `503`, `504` and network errors: a short message plus Retry (which resends the failed turn once without duplicating your message) and manual entry.
  - Only `401` logs you out.
- **Draft restoration** (`src/lib/draftStorage.ts`).
  - One unfinished flow per account is kept in `localStorage`, under a key that includes the account and `VITE_API_BASE_URL`. It carries a schema version and is fully validated when restored. Bad data is discarded with a notice and never crashes the page.
  - Restoring never replays a request and never restores a pending confirmation, so you always get a fresh review.
  - An interrupted creation comes back as an uncertain outcome.
  - "Discard draft" appears next to the restored-draft notice. If storage is blocked or full, a notice says restoration isn't available.
  - Drafts never expire. They're cleared after a successful creation, a discard or restart, or a logout (including one caused by a `401`). Logout also increments a storage generation, so late responses can't save the draft again.
- **Accessibility.**
  - Enter sends and Shift+Enter adds a new line. Enter never sends while an IME composition is in progress.
  - Every input is labelled.
  - Replies, loading states and errors are announced through a polite live region.
  - The review heading gets focus when a complete review appears.
  - The transcript renders plain text only.
- **Layout.** Chat and review sit side by side on large screens and stack on mobile.

## Checks

```bash
npm run lint && npm test && npm run build
```

The tests mock `fetch` and cover:

- the confirmation matcher (positive and negative phrases)
- limits, dates and AI response validation
- draft storage: validation, namespacing, logout clearing and unavailable storage
- the API client's 401 handling
- auth pages, Home states, and the itinerary page (including deleting a trip without a detail refetch)
- the PDF content
- TripChat flows: complete → "yes" creates exactly once; "yes" without a review goes to the AI; a correction after "yes"; a manual edit clears confirmation; stale responses after an edit or mode switch; the three limits; 503/502/504 retry without duplication; 429 Retry-After; 422; keyboard and IME; restoration with no automatic requests; discard; account isolation; corrupt and unavailable storage; interrupted and uncertain creation; logout and 401 clearing
