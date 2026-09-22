# Frontend Spec — Trip Planner

> Defines the client application. Should implement the use cases in `goal-spec.md` and consume the endpoints defined in `api-contract-spec.md`. Existing screens follow the hand-drawn mockups (2026-09-16); the approved conversational trip-entry changes are defined in §12 and `AI-spec.md`.

**Product name:** the app is user-facing branded **"Musafir Travels"** (shown as the welcome/header title), even though the spec files/repo keep the generic "Trip Planner" name.

## 1. Tech Stack
<!-- Framework (React/Vue/Svelte/etc.), language (TS/JS), build tool, styling approach (Tailwind/CSS Modules/etc.), state management library, routing library. -->
- Framework: React + TypeScript
- Build tool: Vite
- Styling: Tailwind CSS
- Routing: React Router
- Server data / caching: TanStack React Query
- Local/UI state: React `useState` + Context (no global store library)
- PDF export: client-side generation (e.g. `@react-pdf/renderer` or `jspdf` + `html2canvas`), no backend PDF endpoint
- Hosting: Vercel (static SPA build, no serverless functions needed)

## 2. Application Structure
<!-- High-level folder/module layout, if you have opinions upfront. -->
```
src/
  main.tsx
  App.tsx                 # routes + providers
  api/                     # API client, React Query hooks (useTrips, useTrip, useLogin, ...)
  auth/                    # AuthContext, ProtectedRoute
  pages/
    LoginPage.tsx
    SignupPage.tsx
    HomePage.tsx
    NewTripPage.tsx
    TripItineraryPage.tsx
  components/
    TripListItem.tsx
    NewTripForm.tsx
    TripChat.tsx           # approved AI enhancement; implemented
    TripDraftReview.tsx    # editable extracted trip details
    DayPlanner.tsx
    ActivityInput.tsx
    PrintButton.tsx
    DeleteTripButton.tsx
    AppShell.tsx           # minimal header wrapper for authenticated pages
  types/                   # shared TS types, mirroring api-contract-spec.md schemas
```

## 3. Pages / Screens
<!-- One entry per screen: route, purpose, key components, data it needs from the API. -->
| Screen | Route | Purpose | Data Needed |
|--------|-------|---------|--------------|
| Login | `/login` | Authenticate with username/password | none (POST credentials) |
| Signup | `/signup` | Create a username/password account | none (POST credentials) |
| Home | `/trips` | "Welcome to Musafir Travels" header; "Add New Trip" button; "Trip Plan" list of the user's saved trips (destination + date range per row) | `GET /trips` (list of Trip summaries) |
| New Trip | `/trips/new` | Approved chat-first trip entry with editable review and manual-form fallback; chat confirmation after review (or “Create trip” button); “← Back to Trips” navigation (see §12) | `POST /ai/trip-draft` per chat turn; existing `POST /trips` on confirmation |
| Trip Itinerary | `/trips/:tripId` | One screen, two states (per mockup): right after creation it shows empty Day 1…Day N ready for activities; once activities exist it shows Destination/dates, Day 1…Day N with activity previews, plus Delete and Print actions; a "← Back to Trips" link returns to `/trips` | `GET /trips/:tripId` (Trip incl. Itinerary/Days/Activities) |

**Navigation requirement (added after first manual QA pass):** every authenticated page needs an explicit way back to Home — a single AppShell header isn't enough on its own to satisfy this. Two affordances, both required: (1) the "Musafir Travels" title in `AppShell` is a link to `/trips` on every authenticated page; (2) `/trips/new` and `/trips/:tripId` additionally show an explicit "← Back to Trips" link, since they're one level deep from Home and a bare logo-link is easy to miss.

## 4. Key Components
<!-- Reusable UI components worth naming upfront (e.g. TripCard, ItineraryTimeline, MapView). Note props/behavior if known. -->
- `AppShell` — header for authenticated pages: "Musafir Travels" title links to `/trips` (Home), plus logged-in username and logout action — no complex nav beyond that, matching the mockups' plain layout
- `LoginForm` — username + password fields, submit calls login, shows validation/auth errors; links to `/signup`
- `SignupForm` — username + password fields, submit calls signup, then logs the new user in and redirects to `/trips`; shows validation errors (e.g. username taken)
- `TripListItem` — one row in the Home screen's "Trip Plan" list: destination + date range; click navigates to `/trips/:tripId`
- `NewTripForm` — manual entry and fallback on `/trips/new`: From date, To date, Destination, Trip Type. Approved AI flow reuses these fields for review; explicit submission calls create-trip and navigates to `/trips/:tripId` (see §12).
- `DayPlanner` — renders one `Day` (Day N, its date) with its `ActivityInput` list; tapping a day expands it to add/edit activities for that day
- `ActivityInput` — single free-text activity row within a `DayPlanner`, with delete
- `PrintButton` — triggers client-side PDF generation of the current trip's itinerary (labeled "Print" per mockup); layout is a plain text list per day (trip destination/dates as a header, each Day as a heading with its activities as a bullet list) — no app branding/styling in the PDF for MVP
- `DeleteTripButton` — deletes the current trip (with a confirm step) and navigates back to `/trips`
- `ProtectedRoute` — route wrapper that redirects to `/login` when there's no authenticated session

## 5. State Management
<!-- What's global state vs. local/component state vs. server cache (e.g. React Query). How is auth state handled? -->
- **Server cache (React Query):** trips list, single trip/itinerary. Query keys: `['trips']`, `['trips', tripId]`. Mutations for create trip, add/edit/delete activity invalidate the relevant query key. **Deleting a trip is a special case:** invalidating `['trips']` alone also refetches `['trips', tripId]` (React Query matches by key prefix by default), which now 404s and briefly flashes an error state before navigation away — found during manual QA. The delete mutation must instead `removeQueries(['trips', tripId])` (evict, don't refetch) and invalidate `['trips']` with `exact: true`.
- **Local/UI state (`useState`):** form field values (login, new trip, activity text being edited), which day is currently expanded on the Trip Itinerary screen.
- **Auth state (Context):** `AuthContext` holds the current auth token and username; populated on login/signup, read by `ProtectedRoute`, `AppShell` (to display "logged in as ..."), and the API client (attached as the `Authorization` header on every request). Both the token and username are persisted in `localStorage` so a page refresh doesn't log the user out or lose the display name; cleared on logout or a `401` response.

## 6. User Flows
<!-- Step-by-step flows for key interactions, e.g. "Create a trip", "Add a destination", "Reorder itinerary". -->
- **Sign up:** User enters a username/password on `/signup` → submit → on success, backend creates the account and returns a token (same shape as login) → store token in `AuthContext`/`localStorage` and redirect to `/trips` (Home). On failure (e.g. username taken), show inline error.
- **Login:** User enters username/password on `/login` → submit → on success, store token in `AuthContext`/`localStorage` and redirect to `/trips` (Home). On failure, show inline error.
- **View trips (Home):** User lands on `/trips` after login and sees "Welcome to Musafir Travels," an "Add New Trip" button, and their saved trips as `TripListItem` rows under "Trip Plan"; clicking a row opens that trip's itinerary.
- **Create a trip (approved enhancement):** From Home, click “Add New Trip” → `/trips/new` → describe the trip in chat and answer clarifications, or choose manual entry → review/edit destination, dates, and trip type → confirm in chat or click “Create trip” → existing API creates the trip → navigate to `/trips/:tripId`, showing empty Day 1…Day N. Details in §12.
- **Plan a day:** On `/trips/:tripId`, tapping a `DayPlanner` (Day N) expands it to show its `ActivityInput` list → user types an activity and it saves (on blur or explicit "Add" action) → activity appears in that day's list, and the itinerary now shows as a "saved trip" (Delete/Print become available).
- **Edit/delete an activity:** User edits an activity's text inline, or clicks delete on an `ActivityInput` row → change is saved/removed immediately.
- **Delete a trip:** On `/trips/:tripId`, user clicks `DeleteTripButton` ("Delete") → confirms → trip is removed and the user is navigated back to `/trips`.
- **Export itinerary to PDF:** On `/trips/:tripId`, user clicks `PrintButton` ("Print") → client generates a PDF from the current itinerary data and triggers a browser download.
- **Logout:** User clicks logout in `AppShell` → clear `AuthContext`/`localStorage` → redirect to `/login`.

## 7. UI/UX Requirements
<!-- Design system or component library (if any), responsiveness, dark mode, accessibility (WCAG level), loading/empty/error states. -->
- No formal design system; plain Tailwind utility styling, kept simple and consistent (single color/spacing scale used throughout).

### Design Tokens (colors & font)
- **Font:** Fira Sans (loaded from Google Fonts), used as the sole typeface — no separate heading/body font pairing.
- **Palette:** white + light brown background with dark blue as the accent/primary color.

| Token | Hex | Usage |
|-------|-----|-------|
| `background` | `#F3E9DA` | Page background (light brown) |
| `surface` | `#FFFFFF` | Cards, panels, form fields, modals (white) |
| `primary` | `#1B3A5F` | Buttons, links, active nav, headings accent (dark blue) |
| `primary-hover` | `#14293F` | Hover/active state of primary elements |
| `text` | `#22313F` | Body and heading text |
| `text-muted` | `#8A7862` | Secondary text, placeholders, helper text |
| `border` | `#E0D0B8` | Borders on cards/inputs (subtle against the background) |
| `error` | `#C0392B` | Inline error/validation messages |

Wired into Tailwind via `tailwind.config.js`:
```js
theme: {
  extend: {
    colors: {
      background: '#F3E9DA',
      surface: '#FFFFFF',
      primary: { DEFAULT: '#1B3A5F', hover: '#14293F' },
      text: { DEFAULT: '#22313F', muted: '#8A7862' },
      border: '#E0D0B8',
      error: '#C0392B',
    },
    fontFamily: {
      sans: ['"Fira Sans"', 'sans-serif'],
    },
  },
}
```
- Dark mode is out of scope (see below), so no dark-mode variants of these tokens are needed for MVP.
- Responsive: must be usable on both desktop and mobile browser widths (per `goal-spec.md` — no native mobile app).
- Dark mode: out of scope for MVP.
- Accessibility: basic semantic HTML, labeled form inputs, keyboard-operable forms/buttons. No formal WCAG level target for a weekend MVP.
- Loading state: spinner/skeleton while trip list / trip detail queries are in flight.
- Empty state: Home's "Trip Plan" list shows a friendly empty state with an "Add New Trip" call-to-action when the user has no trips yet.
- Error state: inline error messages for failed login, failed trip/activity save, and failed data fetch (with a retry action where reasonable).

## 8. Auth & Permissions (Client Side)
<!-- Login/signup flow, session/token storage, protected routes, role-based UI differences. -->
- Basic username/password login and signup in MVP (email-based auth/password reset is still deferred to post-MVP per `goal-spec.md`).
- On successful login or signup, the API returns a token; stored in `localStorage` and held in `AuthContext` for the session.
- All routes except `/login` and `/signup` are wrapped in `ProtectedRoute`, which redirects to `/login` if no valid token is present.
- No roles/permission tiers — every logged-in user can only see and manage their own trips (enforced by the backend; the frontend simply scopes all requests to the current user via the auth token).
- A `401` response from the API clears the stored token and redirects to `/login`.

## 9. Non-Functional Requirements
<!-- Performance targets (e.g. load time), browser support, offline behavior, SEO needs. -->
- Browser support: latest versions of Chrome, Firefox, Safari, Edge. No legacy browser support required.
- Performance: no formal budget for a weekend MVP; keep initial load reasonable by relying on Vite's default code splitting.
- Offline: not required. App assumes an active network connection.
- SEO: not required — the app is behind login, no public/marketing pages.

## 10. Deployment (Vercel)
<!-- How the SPA is built and served on Vercel, and what that implies for routing/config/CORS. -->
- **Build:** Vercel builds with `npm run build` (Vite) and serves the static `dist/` output. No Vercel serverless functions are needed — the API lives on a separately hosted backend, and PDF export is client-side.
- **SPA routing fallback:** React Router does client-side routing, so a static host needs to serve `index.html` for every path (otherwise refreshing `/trips/:tripId` 404s). Add `vercel.json`:
```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```
- **API base URL:** never hardcoded. Read from a build-time env var, e.g. `VITE_API_BASE_URL`, set per Vercel environment (Production / Preview / Development) in the project settings, and referenced in the API client as `import.meta.env.VITE_API_BASE_URL`. Points at the CloudFront URL in front of the ALB (`backend-spec.md` §9 Infrastructure), not the ALB directly — the ALB is HTTP-only, and an HTTPS Vercel page can't call a plain-HTTP API (browsers block it as mixed content), so CloudFront's HTTPS is required, not optional.
- **CORS:** Preview deployments hit the same production API as Production (no separate staging backend — decided to keep `backend-spec.md`'s single-environment setup), so the backend must allow both the Vercel production domain and its `*.vercel.app` preview domains as CORS origins.
- **HTTPS:** automatic on Vercel — relevant since the app sends an auth token on every request, and required end-to-end (frontend and API both) since a mixed HTTPS/HTTP setup gets silently blocked by the browser rather than just warned about.

## 11. Open Questions
The chat-first UI and fallback behavior in §12 are approved; implementation is available on `codex-ai-feature`. AI decisions are approved in `AI-spec.md`; remaining implementation/release tasks are tracked in its §9. Existing decisions remain: activities are free text, PDF output is a plain list, and Preview uses the production API.

## 12. Conversational Trip Entry — Approved Specification

This section owns the UI/UX changes. `AI-spec.md` owns extraction behavior; `api-contract-spec.md` owns the new AI request/result schemas. Architecture: browser → existing authenticated backend → hosted model. The frontend never calls the provider or contains provider credentials. Vercel remains a static SPA, and `VITE_API_BASE_URL` continues to identify the existing backend.

### Entry, Layout & Components

- Keep `/trips/new` and existing Home/back navigation. Approved default: show “Describe your trip” with a visible “Enter details manually” alternative.
- Add `TripChat` for plain-text user/assistant messages and the composer, plus `TripDraftReview` for editable destination, start date, end date, and trip type. Keep transport in `src/api/` and shared contract types in `src/types/`.
- Accept English and Hinglish (Hindi/English mixed in Latin script) in the composer. Show a short “English or Hinglish” input hint. Keep interface labels and all assistant replies in English, including responses to Hinglish input (`AI-spec.md`).
- Opening prompt: “Where would you like to go, when, and who is travelling?” Show this persistent sample below the composer: “Goa from 03/04/2027 to 05/04/2027 with friends.” Pair it with the explanation “Dates use DD/MM/YYYY — this means 3–5 April 2027.” Do not rely on placeholder text alone; the convention must remain visible while typing. Do not preselect `solo` for an unresolved chat draft.
- Use existing Fira Sans, colors, spacing, and Tailwind styling. On desktop, conversation and draft may sit side by side; on mobile, stack them without horizontal scrolling. Clearly label missing or unresolved fields.

### State & Turn Handling

- **Draft restoration — approved:** Persist one unfinished creation flow per signed-in account in browser `localStorage`, separate from the shared trip query cache. Store bounded messages, current field values (including incomplete manual edits), unresolved-field markers, composer text, selected mode, original `reference_date`/IANA `timezone`, schema version, and last-updated time. Namespace storage by account and backend environment; restore only after authentication identifies the matching account. Cross-device restoration is outside this version.
- Validate stored structure on restoration and validate field values before AI requests or creation. Invalid or unsupported saved data must not crash the page or be submitted. If storage is unavailable/full, preserve the active in-memory flow and explain that restoration is unavailable. Preserve the original date context and display it when resuming on a later date; restarting refreshes it.
- Restore chat and fields without replaying requests. Reset transient loading/errors and consumed confirmation state; show a fresh summary before accepting a new confirmation. Persist a creation-in-progress marker before submission so an interrupted creation is restored as an uncertain outcome, prompting the user to check saved trips rather than automatically retrying.
- Sending a non-blank message appends it once and calls `POST /ai/trip-draft` with bounded user/assistant history, current draft, and date context. The static greeting is UI copy, not provider history. Show a text loading status and disable additional sends while pending.
- On success, append the validated plain-text reply and update the draft. Render model/user text as text, not HTML. Preserve corrections in the draft sent on subsequent turns; older history must not override them.
- Use cancellation or request-version checks so an old response cannot overwrite manual edits, a restarted conversation, a mode switch, or a page that has been left. Editing the draft invalidates any pending response.
- Enforce the API's input bounds before sending, including the approved 2,000-character maximum per message and 12,000-character sum of message contents per AI request, including the new user message. Show a character count and prevent oversized sends with a clear inline message; preserve the typed text for editing. The approved conversation limit is 20 user and assistant messages combined; reserve space for both the new user message and the AI response before sending a turn. At the history limit, offer manual completion or an explicit restart that clears history/draft and refreshes date context; never silently discard older turns. Retry resends the failed turn once without appending duplicate user messages.

### Review, Confirmation & Manual Fallback

- Show exact dates with written month names and four-digit years, destination, and human-readable trip type for review. Numeric chat input uses day/month/year regardless of browser locale; native date controls may retain their browser-localized appearance, but the review summary must use written month names. When the AI infers an omitted year or resolves “next weekend” to the upcoming Saturday–Sunday, its English reply must disclose the interpretation and present the full dates for confirmation (`AI-spec.md` §4). The user can edit fields directly or send a correction in chat. Direct valid edits resolve the edited field's missing/clarification marker; conflicting date edits remain visibly invalid.
- After displaying a complete validated summary, ask “Shall I create this trip? Reply yes to confirm, or tell me what to change.” Store the exact reviewed draft in `awaiting_confirmation` state. Recognize standalone English/Hinglish confirmations using the explicit phrase list and normalization rules in `AI-spec.md` §5; submit that snapshot through `useCreateTrip` without a further AI request. Confirmation text is shown in the transcript.
- A reply with corrections (for example, “yes, but make it solo”) goes through the AI flow and requires a new summary/confirmation. Any manual edit, new AI turn, restart, or mode switch clears the pending review. Ignore stale responses and consume a confirmation only once. Do not interpret a model reply as user consent.
- Keep “Create trip” available as an alternative and for manual mode. Enable submission only when all fields are valid, no clarification remains, and no AI/create request is pending. Both chat confirmation and button submission use the same guarded creation handler; no second button click is required after chat confirmation.
- Use existing `useCreateTrip` with only the four `CreateTripRequest` fields. Disable repeat submission while pending; navigate only after `201` success. The backend continues generating days.
- **Manual entry — approved:** Keep “Enter details manually” visible alongside chat, including during loading and AI errors. Switching preserves extracted values and abandons pending AI work. Manual mode works when AI is disabled/unavailable. Returning to chat starts a fresh conversation using the current valid draft and fresh date context.
- Preserve details on creation failure. Follow existing `401` logout behavior. For an uncertain network outcome during creation, prompt the user to check the trips list before submitting again; do not automatically retry.
- Clear the saved draft after successful creation or explicit “Discard draft”/restart. Leaving the page or refreshing preserves it. Logout deletes the signed-in account’s saved draft and clears active in-memory state, including logout triggered by a `401` response. Capture the account’s storage key before clearing authentication; cancel or invalidate pending work and suppress subsequent persistence so late responses cannot recreate the deleted draft. Do not expire drafts automatically, regardless of elapsed time. Retain them until successful creation or logout unless the user explicitly discards/restarts. Provide “Discard draft” alongside the restored-flow notice.

### Accessibility & Failure States

- Label the composer and editable fields; make send, mode switching, and confirmation keyboard-operable. Enter sends, Shift+Enter inserts a newline, and composition input must not submit prematurely.
- Announce new replies/loading/errors with a polite live region; avoid re-announcing the whole transcript or moving focus on each reply. After a user requests review, focus the review heading or first unresolved field. Keep “Back to Trips” reachable throughout.
- For `422`, show input/limit validation; for `429`, respect `Retry-After`; for `502`/`503`/`504`, show a brief failure message with retry/manual entry. Preserve draft and chat. Only authentication failure logs the user out.
- Verify complete and partial conversations, corrections, manual switching, stale responses, keyboard/mobile use, all error states, refresh/navigation restoration, account isolation, storage failure, interrupted creation, and duplicate-submit prevention. Run frontend build/lint and run the focused mocked-interaction tests with `npm test` (Vitest, Testing Library, and jsdom).
