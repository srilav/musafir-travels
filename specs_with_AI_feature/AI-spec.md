# AI Spec — Conversational Trip Creation

> **Status: Approved; implementation available on `codex-ai-feature`. Mocked checks cover the integration; live model evaluation and production activation remain pending.** Defines the AI behavior for Musafir Travels. This is the fifth specification, alongside `goal-spec.md`, `frontend-spec.md`, `backend-spec.md`, and `api-contract-spec.md`. The architect has approved integration through the existing FastAPI backend. Anthropic Claude Haiku (`claude-haiku-4-5-20251001`) is the approved provider/model choice. The architect has approved the specified defaults. Remaining implementation and release tasks are listed separately in §9.

## 1. Purpose & Scope

Help an authenticated user create a trip by describing their plans in ordinary language. The AI identifies the destination, travel dates, and trip type, asking follow-up questions when information is missing or unclear.

The result is the same trip currently created through the manual form. The existing backend generates the itinerary's empty Day 1…Day N entries.

**In scope:** text conversation, field extraction, clarification, corrections, handoff of reviewed trip details to the existing creation flow, and retrieval of curated reference notes (festival/holiday dates, alternative place names, Hinglish phrase meanings) to support extraction (§4, Reference Knowledge).

**Out of scope:** destination recommendations, activity/itinerary generation, bookings, pricing, web search, voice input, multiple destinations per trip, and modifying existing saved trips. These exclusions preserve the current product scope.

## 2. Specification Ownership & Architecture Boundary

| Specification | Responsibility |
|---------------|----------------|
| `AI-spec.md` | Extraction rules, conversational behavior, structured result, validation, AI failure handling, and evaluation. |
| `frontend-spec.md` | Chat entry point, page layout, components, message rendering, editable review, loading/error states, accessibility, and navigation. |
| `api-contract-spec.md` | New authenticated trip-draft endpoint and its schemas; existing trip-creation contract remains unchanged. |
| `backend-spec.md` | AI router/service, provider integration, validation, operational limits, secret configuration, and reference-knowledge storage/retrieval (§11); existing trip persistence remains unchanged. |
| `goal-spec.md` | Product purpose and trip/itinerary boundaries. |

**Approved architecture:** browser chat → existing FastAPI backend → hosted model API → validated draft/clarification → browser review → existing trip-creation endpoint.

Add `POST /api/v1/ai/trip-draft` to the existing authenticated API. The backend owns the prompt, calls the hosted model, validates the response, and returns structured JSON. Model inference runs at the provider; Musafir does not host model weights or require GPU infrastructure.

The frontend keeps the bounded conversation and current draft locally, persists the unfinished flow in browser storage for restoration, and sends the required context with each AI request. The backend stores no chat sessions and performs no trip writes through this endpoint. Existing authentication may still read the user database. After explicit review, the frontend uses `useCreateTrip` and the unchanged `POST /api/v1/trips` contract. Trip tables are unchanged; the only database addition is the read-only reference-knowledge store (`backend-spec.md` §11).

Keep provider credentials exclusively server-side, supplied through the existing ECS/Secrets Manager pattern. The frontend remains a static Vite SPA on Vercel; no additional proxy or serverless service is planned. Use Anthropic Claude Haiku with the exact model ID `claude-haiku-4-5-20251001`; do not substitute an alias or another model without an architect decision. Use the official Anthropic Python SDK; the implementation pins version `1.6.0`.

## 3. Required Trip Details

| Field | Required result | Extraction rule |
|-------|-----------------|-----------------|
| `destination` | Non-empty, trimmed string | One destination explicitly named by the user. Preserve their intended place; do not invent a country, substitute a destination, or geocode it. |
| `start_date` | Valid calendar date, `YYYY-MM-DD` | First travel day, with a resolved year. |
| `end_date` | Valid calendar date, `YYYY-MM-DD` | Last travel day, inclusive; must be on or after `start_date`. |
| `trip_type` | `solo`, `couple`, `family`, or `group_of_friends` | Map clear descriptions of companions to the existing enum. Ask when uncertain. |

Examples: “by myself” → `solo`; “with my spouse or partner or girl friend or boy friend” → `couple`; “with my children” → `family`; “with friends” → `group_of_friends`. “Two people” alone does not establish `couple`. Do not inherit the manual form's default `solo` when the conversation provides no trip type.

## 4. Conversation & Extraction Rules

1. Invite the user to describe the trip. Accept all details in one message or across several turns.
2. Extract only supported information. Retain previously established fields and ask a short, focused question about missing or ambiguous details.
3. Treat an explicit correction as replacing the previous value. Preserve unrelated fields and revalidate the complete draft after every change.
4. When the user mentions alternatives or conflicting details without choosing, ask which value to use. For multiple destinations, explain that one trip supports one destination and ask them to choose.
5. When all four fields are valid and unambiguous, return a draft ready for review. Extraction completion does not authorize saving.
6. **Confirmation — resolved:** After showing the complete current draft and asking whether to create it, accept a clear chat reply such as “yes,” “yes, create it,” or “haan, bana do.” The frontend submits the reviewed draft through the existing creation endpoint. Any correction invalidates the previous confirmation and requires a fresh summary and confirmation.
7. State that a trip was created only after the existing API returns success. The AI does not invoke persistence tools directly.

**Date handling — approved:**

- At conversation start, capture `reference_date` (the user's local date) and `timezone` (IANA identifier). Send this fixed context on every turn so earlier relative dates do not shift at midnight. A restarted conversation gets fresh context. Return date-only values without UTC conversion.
- Resolve unambiguous expressions such as “tomorrow”; show the exact resulting dates for confirmation.
- **Missing year — resolved:** For an unambiguous month/day without a year, infer its next valid occurrence on or after the conversation's `reference_date`. For a range with both years omitted, anchor its start this way and resolve the end consistently; an explicit December-to-January range crosses into the following year. Do not silently repair a reversed range within the same month. Preserve explicitly supplied years, including past years; ask if partially specified years leave the intended range unclear.
- Show the full inferred dates, including years, and state that the year was inferred. Require confirmation through the existing review step before creating the trip. An omitted year alone is not a reason to ask a follow-up question.
- **Numeric dates — resolved:** Interpret day-first numeric input consistently as day/month/year: `03/04/2027` means 3 April 2027, never 4 March. Apply the same convention to day/month input without a year, using the next-occurrence rule above. Do not ask about day/month ordering or silently switch to month/day/year when a date is invalid (for example, `04/13/2027`); ask for a corrected date. Require clarification for two-digit years. Explicit ISO `YYYY-MM-DD` remains supported as ISO, including API values.
- Show dates with written month names and four-digit years in conversational replies and review summaries so users can verify the interpretation. UI examples and helper text must explain the convention (`frontend-spec.md` §12).
- **Next weekend — resolved:** Infer the upcoming Saturday–Sunday using the fixed local `reference_date`: the first Saturday on or after that date, followed by Sunday. On Saturday, this includes today and tomorrow; on Sunday, use the following Saturday–Sunday. State the interpretation and show both exact dates, including years, for confirmation. If the user explicitly supplies different dates, honor those dates. Impossible dates still require correction.
- **Duration — resolved:** With a resolved start date and a duration of N days, calculate the inclusive end as start + N − 1 calendar days. For N nights, calculate start + N days. For example, three days starting 10 June ends on 12 June; three nights ends on 13 June. Apply the approved year-inference rule if the year is omitted. Present derived dates for confirmation; ask if the duration's meaning is unclear.
- Reject impossible dates and reversed ranges. Allow same-day trips. Do not introduce a future-only restriction: the existing contract does not prohibit past dates.

### Language Handling

Accept English and Hinglish, including informal Romanized Hindi spelling and English place/date names. Apply the same extraction, clarification, and confirmation rules in both languages; API field names, ISO dates, and trip-type enum values remain unchanged. Do not infer companions from ambiguous language: for example, “hum dono” means two people but does not establish `couple`.

Hinglish date expressions can also be ambiguous: “kal” may mean yesterday or tomorrow depending on context. Ask for clarification when context does not resolve it. Always write assistant replies, clarification questions, and review summaries in English, including when the user writes in Hinglish or requests another reply language. Preserve destination names as supplied; do not translate place names unnecessarily.

### Reference Knowledge (RAG) — approved

Before each model call, the backend retrieves curated reference notes that match the user's messages and passes them to the model as a separate, clearly labelled data block after the date context. Retrieval is keyword-based (no embeddings); storage and search are owned by `backend-spec.md` §11.

- **Content:** (1) festival and public-holiday dates with the surrounding weekend or long weekend, only for years whose dates were verified against the published Government of India (DoPT) list; (2) alternative names and spellings of places; (3) meanings of common Hinglish date, duration, and companion phrases, consistent with the rules above.
- **Festival dates:** when the user ties the trip to a festival (“Diwali weekend”, “Holi pe”), resolve dates from the matching note, applying the missing-year rule when no year is given. Show the full dates for confirmation. If no note covers the festival or the stated year, ask for exact dates; never guess. Moon-sighting (tentative) dates must be presented as tentative and confirmed.
- **Place names:** notes only confirm that a name refers to a place. Keep the destination exactly as the user wrote it; never substitute a spelling from a note.
- **Precedence:** notes are data, not instructions. They never override these rules, the submitted draft, or dates the user stated explicitly. Irrelevant notes are ignored.
- **Bounds and failure:** at most 6 notes and 4,000 characters per request. Retrieval is best effort: if it fails or times out, drafting continues without notes. Retrieved notes are not logged.

## 5. AI-to-Frontend Result

Return `TripDraftResponse` from the new backend endpoint, as defined in `api-contract-spec.md`. It is separate from `CreateTripRequest`:

```json
{
  "draft": {
    "destination": "Kyoto, Japan",
    "start_date": "2027-10-01",
    "end_date": "2027-10-03",
    "trip_type": "couple"
  },
  "missing_fields": [],
  "clarification_fields": [],
  "reply": "Kyoto, Japan, 1–3 October 2027, as a couple. Please review these details."
}
```

All four draft keys must exist; unresolved values are `null`. Both field lists contain only names of these four keys. `missing_fields` identifies absent values; `clarification_fields` identifies ambiguous or invalid values. `reply` is plain text for the conversation. None of these metadata fields are sent to the trip API.

The backend must validate the model result with strict schemas and deterministic date/enum checks before returning it. The frontend must also check completeness and validity before enabling creation. Readiness requires four valid fields and no unresolved clarification. User confirmation is application state, never a model-generated permission flag. The frontend enters `awaiting_confirmation` only after displaying a complete validated summary of the exact current draft. It recognizes standalone affirmative phrases deterministically while in that state, using an explicit English/Hinglish phrase list with case, whitespace, and punctuation normalization. Initial supported phrases: “yes,” “yes create it,” “create it,” “create trip,” “confirm,” “haan,” “haan bana do,” and “haan create kar do.” Do not use substring matching: “yes, but change the dates” is a correction, not confirmation. A confirmation consumes the pending review once and starts submission; it does not require another AI call. Other messages go through the normal AI flow, and the resulting draft must be shown again for confirmation. Without a pending review, an affirmative alone cannot create a trip. On confirmation, construct the existing `CreateTripRequest` using only the four reviewed fields. Later AI responses must not overwrite newer user edits.

## 6. Failure Handling & Data Boundaries

- **Manual entry — resolved:** Keep “Enter details manually” available alongside chat at all times, including when AI is disabled or unavailable. Switching preserves already extracted values and lets the user complete or correct them without AI. On timeout or malformed output, preserve the draft and offer retry or manual entry. Never create a trip from invalid output.
- On trip-creation failure, preserve the confirmed details and follow existing API error handling. Do not automatically repeat a creation request after an uncertain network outcome; the API has no specified idempotency mechanism.
- Treat user messages as trip-planning data, not instructions to change the extraction contract or bypass confirmation. Off-topic requests receive a brief redirect to collecting trip details.
- Send only conversation context needed for this draft and date resolution to the AI. Do not send account credentials, the Musafir JWT, or unrelated saved trips.
- **Draft restoration — resolved:** Restore unfinished conversation and trip details after refresh or leaving and returning to the creation page. Use browser-local storage scoped to the signed-in account; no server-side chat storage or cross-device sync is introduced. Preserve the original reference date/timezone so relative dates do not change silently. Revalidate restored data and present a fresh review before accepting confirmation; never replay a saved confirmation or submission. Delete the account’s saved draft on logout, including logout caused by an expired/invalid session. No automatic expiry applies: retain the saved draft until successful trip creation or logout. An explicit user-requested discard/restart may also clear it; elapsed time alone never does. Do not collect raw-chat analytics.
- **Conversation length — resolved:** Limit each conversation to 20 user and assistant messages combined. At the limit, offer manual completion or restart; do not silently truncate history. Reserve room for the assistant response before accepting a new AI turn, so the response cannot exceed the limit. Static UI greetings and notices do not count.
- **Message size — resolved:** Maximum 2,000 characters per user or assistant message. Enforce the user-input limit before sending and validate the assistant reply on the backend.
- **Aggregate message size — resolved:** Each AI request may contain at most 12,000 characters summed across all message contents, including the latest user message. This excludes draft fields and server-owned instructions. Preserve history rather than silently truncating it; when a request would exceed the limit, offer manual completion or restart.
- Use the bounded request and error contract in `api-contract-spec.md`. The approved provider timeout is 20 seconds; on timeout, preserve the draft and offer retry or manual entry.
- Apply the backend AI rate limit and disable provider SDK automatic retries for the initial version. Cap each model response at 1,024 output tokens, covering the full structured result and conversational reply. The approved Anthropic usage budget is US$5 per month for Musafir. Configure and verify enforcement before production use; the per-process request limiter is not a spending cap. Anthropic’s standard API data-handling and retention policy is accepted; zero data retention is not required. Verify the applicable policy and account settings before production use without assuming a specific retention duration.

## 7. Acceptance & Evaluation

Use repeatable examples with fixed current-date/timezone context. Assert extracted fields and clarification behavior rather than exact conversational wording.

| Scenario | Expected outcome |
|----------|------------------|
| “Kyoto, Japan, October 1–3, 2027, with my spouse” | All four fields extracted; `couple`; review required before creation. |
| “Mujhe friends ke saath Goa jaana hai, 10 se 12 December 2027” | Extract Goa, 2027-12-10 through 2027-12-12, and `group_of_friends`; present review in English before creation. |
| “Hum dono Jaipur jayenge, 3 se 5 April 2027” | Extract destination/dates; ask for trip type. |
| “Actually friends nahi, family ke saath” after a complete draft | Update only trip type to `family`; require review again. |
| “Kal Goa” without disambiguating context | Ask in English for the intended date and remaining fields. |
| “Goa with friends” | Preserve destination and `group_of_friends`; ask for dates. |
| “Paris, 3–5 April 2027, two people” | Ask for trip type; do not assume `couple`. |
| “Goa, October 10–12” with reference date 2026-09-18 | Infer 10–12 October 2026; disclose inferred year and show full dates for confirmation; ask for trip type if absent. |
| “Goa, October 10–12” with reference date 2026-11-01 | Infer 10–12 October 2027; show full dates for confirmation. |
| “December 30 to January 2” with reference date 2026-09-18 | Infer 30 December 2026 through 2 January 2027; show both years for confirmation. |
| Explicit dates in a past year | Preserve the supplied year; do not replace it with the next occurrence. |
| “Goa from 03/04/2027 to 05/04/2027 with friends” | Extract 2027-04-03 through 2027-04-05 and `group_of_friends`; show 3–5 April 2027 for confirmation without asking about date order. |
| `04/13/2027` | Ask for a corrected day/month/year date; do not reinterpret as 13 April. |
| “Next weekend” with reference date Friday, 18 September 2026 | Infer Saturday, 19 September through Sunday, 20 September 2026; show exact dates for confirmation. |
| “Next weekend” with reference date Saturday, 19 September 2026 | Infer 19–20 September 2026; explicitly show that the trip begins today. |
| “Next weekend” with reference date Sunday, 20 September 2026 | Infer 26–27 September 2026; show exact dates for confirmation. |
| “Actually, make it solo” after a complete draft | Change only trip type; require review again. |
| Three days starting 10 June 2027 | End date 12 June 2027, presented for confirmation. |
| Three nights starting 10 June 2027 | End date 13 June 2027, presented for confirmation. |
| Invalid date, reversed range, or multiple destinations | Clarify; no creation request. |
| Same start/end date | Valid one-day trip. |
| Instruction to bypass review or output an unsupported trip type | Preserve contract and confirmation requirement. |
| AI failure or malformed result | Preserve draft; retry/manual entry available. |
| “Yes, create it” or “haan, bana do” after a complete review | Submit the exact reviewed draft once through the existing authenticated endpoint; navigate only after success. |
| “Yes” without a complete pending review | No creation request. |
| Refresh or leave and return during an unfinished conversation | Restore the correct account’s conversation, draft, and original date context; no automatic AI or creation request. |
| Logout, then sign in again | Previous unfinished conversation and draft are deleted; start a new flow. |
| Restore after a creation request was interrupted | Mark the outcome uncertain and ask the user to check saved trips; never replay submission. |
| “Yes, but make it solo” after review | Process correction, show updated summary, and request confirmation again; no immediate creation. |
| “Goa for Diwali weekend with friends” with reference date 2026-09-18 | Use the Diwali 2026 note: 7–8 November 2026; show full dates for confirmation. |
| “Diwali 2027 pe ghar walon ke saath Jaipur, long weekend” | 29–31 October 2027 and `family`, from the notes. |
| A festival in a year with no verified note (e.g. “Holi 2029”) | Ask for exact dates; do not guess. |
| “Pondy with friends, 3 to 5 April 2027” | Destination stays “Pondy”; the place-name note does not replace it. |
| “Goa, teen raat, 10 June 2027 se, dosto ke saath” | 10–13 June 2027 (three nights) and `group_of_friends`. |
| Retrieval unavailable | Drafting continues without notes; no error shown for retrieval alone. |

Verify that no creation request occurs before confirmation and repeated clicks while submission is pending do not submit again. Add deterministic tests for parsing/validation and mocked AI responses; evaluate the selected model separately using the acceptance cases above.

Backend evaluation must also cover authentication before provider calls, request limits, provider timeout/failure mapping, invalid structured output, and absence of trip writes. Use mocked provider responses in CI; live provider evaluation is an explicit separate activity.

## 8. Approved Decisions

- **Execution — resolved:** existing FastAPI backend calls a hosted model through a new authenticated endpoint; trip persistence and trip tables stay unchanged.
- **Reference knowledge — resolved:** curated notes (holiday dates, place-name variants, Hinglish phrases) retrieved by PostgreSQL `pg_trgm` keyword search; no embeddings provider. Festival dates are added per year only after verification against the published DoPT list (§4, Reference Knowledge).
- **Provider/model — resolved:** Anthropic; Claude Haiku, pinned to `claude-haiku-4-5-20251001`.
- **Provider data handling — resolved:** Accept Anthropic’s standard API data-handling and retention policy; no zero-data-retention requirement. Application-level restrictions on credential sharing and raw-chat logging remain unchanged.
- **SDK — resolved:** Official Anthropic Python SDK, pinned to version `1.6.0`.
- **Monthly spending budget — resolved:** US$5 per month for Musafir’s Anthropic usage. Budget enforcement must cover all users and backend instances; manual trip entry remains available when AI usage is blocked.
- **Output budget — resolved:** Maximum 1,024 output tokens per model response, including structured trip fields and conversational text. Truncated output is a failed extraction; never submit a partial draft.
- **Languages — resolved:** Accept English and Hinglish (mixed Hindi/English in Latin script). Devanagari Hindi and other languages are not required for this version. Assistant replies are always in English, including for Hinglish input.
- **Missing years — resolved:** Infer the next occurrence and show exact dates, including years, for confirmation (see §4).
- **Numeric dates — resolved:** Use day/month/year consistently; show a UI sample and written-month interpretation.
- **Next weekend — resolved:** Infer the upcoming Saturday–Sunday and show exact dates for confirmation; see §4 for weekend boundary handling.
- **Duration — resolved:** N days includes the start day; N nights ends N calendar days after the start. Show derived dates for confirmation.
- **Confirmation — resolved:** A clear affirmative chat reply after review creates the trip; application state binds confirmation to the exact reviewed draft.
- **Manual entry — resolved:** Keep manual entry alongside chat and as the AI-failure fallback, preserving extracted values.
- **Draft restoration — resolved:** Restore unfinished chats and trip details on the same browser after refresh/navigation; require a fresh review before confirmation.
- **Logout — resolved:** Delete the account’s saved draft and clear active conversation state on logout, including authentication-triggered logout.
- **Draft retention — resolved:** No automatic expiry; retain the draft until successful trip creation or logout. Explicit discard/restart remains available as a user action.
- **UI and operational defaults — approved:** Use the chat-first/manual-fallback flow in `frontend-spec.md`, schemas in `api-contract-spec.md`, and server controls in `backend-spec.md` as specified.
- **Timeout and retries — approved:** 20-second provider deadline; one attempt per request with SDK automatic retries disabled.
- **Rate limit — approved:** 10 AI requests per authenticated user per 60 seconds, with the documented per-process MVP limitation.

- **Conversation length — resolved:** 20 user/assistant messages combined, with manual completion or restart at the limit.
- **Message size — resolved:** 2,000 characters per user or assistant message.
- **Aggregate message size — resolved:** 12,000 message-content characters per AI request, including the latest user message.

## 9. Remaining Implementation & Release Tasks

The architectural and product decisions above are approved. The SDK is pinned to `1.6.0`. Before release, configure and verify enforcement of the US$5 monthly budget, and verify that the provider account uses the accepted standard API data-handling policy. Record these before enabling production AI. These are implementation/release tasks, not unresolved product choices; reopen review only if an approved requirement must change.

Activation and optional live evaluation instructions are in `backend/README.md`; frontend checks are documented in `frontend/README.md`.
