# Technical and Deployment Guide

## Purpose

This is the live set surface for show night, not the public band site, not the
catalog, and not the band OS. The public page reads the current official sets
from a shared database, and the owner can publish set changes through an
authenticated browser interface. Show Night does not expand Vault. Missing
media fails closed. The public band site stays at
<https://www.raddadband.com>.

## Production links

- Live set surface: <https://rad-dad-show-night.jeffstory007.chatgpt.site>
- Owner editor: <https://rad-dad-show-night.jeffstory007.chatgpt.site/show-control>
- Public band site: <https://www.raddadband.com>
- GitHub: <https://github.com/rupret007/rad-dad-show-night>

## Application structure

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | Public event page and master run of show |
| `app/not-found.tsx` | Shared closed-link page for unknown, draft, and archived slugs |
| `app/live-set-lists.tsx` | Live set rendering and 30-second refresh |
| `app/show-control/` | Owner-only song editor |
| `app/song-board.tsx` | Public suggestion form and feed |
| `app/api/show/route.ts` | Public show reads and authenticated set writes |
| `app/api/shows/route.ts` | Owner show listing, cloning, and lifecycle status |
| `app/api/coach/route.ts` | Local set review and optional OpenAI analysis |
| `app/api/enrich/route.ts` | Authenticated YouTube lookup and search fallback |
| `app/api/suggestions/route.ts` | Canonical public suggestion GET and POST route |
| `lib/show-data.ts` | Event constants and initial confirmed songs |
| `lib/show-store.ts` | Database seeding, reads, and song hydration |
| `lib/show-read-integrity.ts` | Exact-show fallback policy and validated device snapshots |
| `lib/show-night-use.ts` | First-open next action, leftover public actions, and practice resume |
| `lib/run-position.ts` | Exact-identity current/previous/next resolution; no title/index guessing |
| `lib/official-set-identity.ts` | Validate retained versus new IDs against the exact show/set |
| `lib/show-lifecycle.ts` | Shared owner/UI and API lifecycle guards and confirmation copy |
| `lib/show-control-posture.ts` | Owner status deck, one-next-step priority, and leftover owner work |
| `lib/admin-access.ts` | Owner email authorization |
| `lib/surface-roles.ts` | Live-set / catalog / public-site / band-OS roles |
| `lib/song-resources.ts` | YouTube URL parsing and fail-closed public media |
| `lib/show-media.ts` | Existing flyer fallbacks for first paint |
| `app/show-flyer.tsx` | Fail-closed public flyer |
| `db/schema.ts` | Drizzle schema |
| `drizzle/0000_show_control.sql` | Initial D1 migration |
| `.openai/hosting.json` | Sites project and logical storage bindings |

## Runtime architecture

### Public page

The server renders the current set from D1. `LiveSetLists` then requests
`GET /api/show` every 30 seconds and after the tab returns to the foreground.
This lets an already-open page receive changes made in Show Control. The
service worker caches `/api/show` only when its response carries the verified
database source header. Navigation responses are cached by the explicit
offline-preparation flow only after the rendered page identifies a database
source; ordinary network-first fallback responses cannot overwrite the saved
show page. The ready indicator is versioned with the cache and turns on only
after the full show page, practice page, and verified show API are all stored.

The public list renders YouTube and lyrics actions for songs not marked
original only when the official set has a saved direct URL. A local covers
table is not official-set media. Search fallbacks are not shown as if they
were media. Original songs display neither resource.

If D1 is temporarily unavailable, the server may return the confirmed defaults
in `lib/show-data.ts` only for the canonical September 19 event. An explicit
slug for any cloned or future show returns an unavailable response instead of
borrowing another event's songs. A cloned show also cannot inherit another
event's timeline, set times, or flyer when its own rows are present but empty
or mixed. Live refresh, device snapshots, and the offline cache accept a
database payload only when `show.slug` and song `showId` values belong to the
requested event.

Every successful show payload identifies its source as `database` or
`confirmed-fallback`. Official set cards use `buildShowSets` against that
show's own timeline, not a hardcoded September schedule. The client persists
only database-backed payloads as a validated, show-scoped device snapshot. A
fallback, failed refresh, or another show's payload never replaces that
snapshot. The UI labels a last verified set and a repository baseline
differently so interrupted live updates cannot masquerade as current. The
public hero names one next step from this show's verified list: start with
the first official set, or suggest a song when the night is empty. Leftover
suggest and practice stay after that step. Empty official sets say so instead
of showing `0 songs ~0 min`. Empty clones also omit another night's run of
show and featured-guest production notes.
Practice names the next song and only resumes a place that belongs to this
slug. An empty clone does not inherit another show's set. Public show reads
strip owner rehearsal notes. The unscoped homepage only resolves the default
published show; it never inherits the latest published clone.

Responsive navigation preserves the public golden path: phones keep direct
links to the official sets and suggestion board, while the owner editor stays
in the footer. Practice mode keeps a direct set-list link and its exit action.
This is CSS-only navigation prioritization; it does not change show data,
publishing state, or authorization boundaries.

### Show Control

`/show-control` uses the platform's Sign in with ChatGPT flow. The page and all
official-set writes verify the authenticated email on the server. Client-side
buttons are convenience controls, not the authorization boundary.

The editor keeps changes in browser state until the owner saves the active set.
`POST /api/show` validates the payload, replaces that set in one D1 batch, and
returns the canonical saved rows.

Show Control can switch between D1-backed show records and clone an existing
show into a new draft. Cloning can copy the timeline and show-specific songs,
or start an empty night that does not inherit another event's songs or set
times. The original event remains unchanged. The editor shows this show's own
set times from the loaded payload, not the September 19 defaults.

The lifecycle API refuses to move the default public show away from `published`,
because doing so would strand the unscoped public homepage and there is no
replacement-default workflow. Show Control also blocks lifecycle requests while
any set has unsaved browser edits and confirms the public-link consequence before
an allowed publish or archive request. The API repeats the default-show guard;
the disabled owner button is not the security or integrity boundary.

Owner copy in `lib/show-lifecycle.ts` keeps Save and Publish distinct: saving a
set never claims a draft is live. The public page names an open public share link.
Unknown, draft, and archived slugs share `app/not-found.tsx` and the same
"no published show was found" copy, so a closed link cannot leak private title
or inherit another event.

`lib/show-control-posture.ts` derives the phone status deck only from the
currently verified show payload and in-browser dirty-set state. Its one next
step prioritizes saving changed sets, starting a verified empty show, publishing
saved private sets, then opening band run mode. Leftover on this show after that
step is also derived here: leftover unsaved sets, leftover empty sets on this
show, and leftover share-link proof. Leftover empty copy never names another
night's songs or times. Missing set definitions fail closed with no action and
no leftover list. The deck also says that Travis owns booking; it adds no
booking, outreach, posting, or alternate write path. Its Save, leftover save,
and Publish controls reuse the existing authenticated endpoints and lifecycle
confirmation. Leftover share-link proof reuses the current public link. An
initial owner-read failure renders a retry screen before the posture helper
or editor controls can render; repository fallback state never enables a write.
Hosted leftover-honesty also refuses leftover owner copy on public pages.

### Suggestions

Public suggestions remain separate from official songs. The canonical
`/api/suggestions` route reads the public Google Sheet feed and sends new ideas
to the connected Google Form. It rejects obvious duplicate title-and-artist
pairs when the feed is available.

Suggestions default to covers. The inline form includes an original/unreleased
checkbox, encoded in the existing Google Form notes field as an `[ORIGINAL]`
marker. The API strips that marker before display and returns `isOriginal` to
Show Control. Cover suggestions run resource lookup when added to a draft;
checked originals skip it and hide public YouTube and lyrics actions.

The backup form remains linked from the public page.
It opens the connected Google Form directly; there is no second application
write endpoint with separate validation behavior.

## Database

The logical D1 binding is `DB`.

### `songs`

Stores the official set slug, position, title, artist, transition and original
states,
performance cue, key, tuning, YouTube information, rehearsal notes, updater,
and timestamps.

Each song belongs to a show and carries an estimated duration used by Set Coach.

### `shows` and `show_blocks`

`shows` stores the public slug, event metadata, lifecycle status, and default
event. `show_blocks` stores the ordered performance and changeover timeline.

The schema retains an unused chord URL column for migration stability. Lyrics
URLs are exposed for covers and hidden for originals.

### `site_settings`

Stores the one-time seed marker. On the first successful database request,
`lib/show-store.ts` inserts the 32 confirmed baseline songs and records
`show-control-seed-v1`. Future requests do not reseed deleted or changed songs.

The index `idx_songs_set_position` supports ordered reads by set.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_EMAIL` | Yes | Comma-separated owner email allowlist for official-set writes |
| `YOUTUBE_API_KEY` | No | Enables automatic selection of an embeddable YouTube result |
| `OPENAI_API_KEY` | No | Adds OpenAI pacing and handoff analysis to Set Coach |
| `OPENAI_MODEL` | No | Overrides the Set Coach model; defaults to `gpt-5.4-mini` |

Production values belong in Sites environment settings. Do not put API keys in
Git, `.openai/hosting.json`, client components, or documentation.

When `YOUTUBE_API_KEY` is absent or lookup fails, the API returns a deterministic
YouTube search URL. The owner can choose and paste the correct version.

## API behavior

### `GET /api/show`

Read-only and uncached. Returns show metadata, set definitions, songs, and the
most recent update timestamp plus `dataSource`. Public reads return published
shows only and omit owner rehearsal notes.
Draft and archived slugs return the same not-found response as an unknown slug.
An authenticated owner request from Show Control can read every lifecycle
status, including rehearsal notes. A request with no slug resolves only the
default published show. A non-default show whose rows cannot be verified returns
`503` with `Retry-After`; it never falls back to the canonical event.

### `POST /api/show`

Owner-only. Accepts one set slug and its full ordered song array. Positions are
recalculated server-side. The supplied show slug must resolve exactly; it never
falls back to the default show. Text lengths, known set slugs, URLs, and maximum
set size are validated before the D1 batch runs.

Existing positive integer song IDs are retained only after exact show/set
membership validation. Omitted IDs and valid editor draft tokens create new
rows; numeric strings, duplicate IDs/tokens, and foreign or unknown saved IDs
are rejected rather than silently remapped. The batch remains atomic and no
schema change is needed. Stable identity keeps each performer's selected song
through metadata edits and reorders, but is not a reviewed-base version check
between two owner tabs. See [run-position handoff](RUN_POSITION_HANDOFF.md) for
recovery behavior, test scope, and the separate owner-save issues.

### `POST /api/enrich`

Owner-only. Accepts a title and artist. With `YOUTUBE_API_KEY`, it asks YouTube
for one embeddable, syndicated video. Without a key or match, it returns a safe
search fallback.

### `GET /api/suggestions`

Public. Reads and validates the connected Google Sheet CSV feed within a
six-second deadline and a streamed 512 KiB / 1,000-row cap. It expects the
existing five positional columns: Timestamp, title, artist, submitter, notes.
The four question labels may vary; the Timestamp header and five-column shape
must be present. Only a valid header-only feed is verified empty. HTTP errors,
redirects, invalid UTF-8/CSV, changed shape, or oversized data return `503`, not a
successful empty list. Every response is `no-store`.

### `POST /api/suggestions`

Public. Validates the submission and requires a verified duplicate preflight
before its one connected Google Form write. Unavailable preflight returns `503`
with `delivery: not-sent` and performs no write. A duplicate returns `409` plus
the actual existing board row. A 2xx Form response produces `202` with
`delivery: awaiting-board` and the sanitized submission, never a fabricated
board row or persistence claim. Attempted-write failures, redirects, or the
eight-second deadline return `502` with `delivery: unknown`. No automatic retry
occurs. Suggestions never write to D1.
`lib/public-suggestion.ts` strips official-set fields and allows network writes
only to the connected Google Form. The regression suite in
`tests/suggestion-cannot-mutate-set.test.mjs` fails if a public suggestion can
alter official set order, keys, or song rows.

The public client validates feed/receipt payloads using the browser-safe
`lib/suggestion-board.ts`. It keeps pending delivery separate from verified rows
and only confirms a complete five-field match from a read started after the
attempt. Fields are controlled and disabled during one in-flight write; the
client uses ten-second read / twenty-second write deadlines. Unknown delivery
keeps the draft and requires a fresh read and explicit duplicate-risk
acknowledgement before a further attempt. This is not cross-client idempotency:
the provider's response Sheet can lag, and simultaneous visitors can still
submit the same idea. No new store or provider was added.

`tests/suggestion-recovery.test.mjs` executes the actual GET/POST route handlers
with an allowlisted local-module map and injected fetch fixtures. The browser
suite imports the real audience and owner components into a test-only Vite
entry; `next/link` is an anchor shim there, not a live routing/auth test. All
external HTTP, non-fixture APIs, service workers, and non-local WebSockets are
blocked. Hosted checks include these tests, lint, the focused suggestion
typecheck, the real production build, and the existing local D1/HTTP isolation.

### `GET/POST /api/shows`

Owner-only. Lists shows, clones a source show into a draft (optionally without
copying songs or set times), and updates draft, published, or archived status.
Status changes require an existing show slug.

### `POST /api/coach`

Owner-only. Always returns deterministic timing and readiness findings. When an
OpenAI key is available, it also calls the Responses API with `store: false` for
a short set-coaching review. It never mutates show data.

## Authentication and security

- The public page and show-read API allow anonymous visitors to published shows
  only.
- Show Control initiates Sign in with ChatGPT.
- Every official write independently checks the authenticated email.
- `ADMIN_EMAIL` is configured in the Sites runtime environment.
- YouTube credentials, if added, must be stored as a Sites secret.
- OpenAI credentials, if added, must be stored as a Sites secret.
- Public suggestion input is length-limited and includes a honeypot field.
- User-supplied resource links are limited to HTTP and HTTPS URLs.
- Local show snapshots are versioned, bounded, structurally validated, and
  keyed to the exact show slug before they can render.

## Local development

```bash
npm ci
npm run dev
```

For local owner configuration:

```bash
ADMIN_EMAIL=jeffstory007@gmail.com
YOUTUBE_API_KEY=
```

Local authentication headers and D1 bindings depend on the Sites development
environment. Public fallback data still lets the visual site render when D1 is
not attached.

## Build

```bash
npm run build
```

Hosted leftover-honesty / isolation:

```bash
npm run leftover:hosted
```

That boots a local show-night server and HTTP-proves the canonical night stays
on its own set while an empty clone cannot inherit September 19 songs or times.
It does not write live Sites or owner production data.

The production build must include the worker entrypoint, static assets,
`.openai/hosting.json`, and the D1 migration.

## Deployment model

The site uses OpenAI Sites because the application requires server routes,
authentication, runtime environment variables, and D1. GitHub Pages is not the
production host.

A source-code release follows this sequence:

1. Make and review the source change.
2. Run the production build.
3. Commit the exact built source state.
4. Push the commit to the Sites source repository.
5. Package the validated build and migration.
6. Save a Sites version against that exact commit.
7. Deploy the saved version publicly.
8. Confirm deployment success.
9. Push the same source commit to GitHub `main` when authorized.

GitHub and Sites are intentionally separate:

- GitHub preserves and shares the source.
- Sites runs the production application.
- D1 preserves live set changes.
- Show Control publishes data changes without a code deployment.

## Maintenance rules

- Use Show Control for ordinary song and order changes.
- Change `lib/show-data.ts` only when the baseline for a new database must
  change; it does not overwrite an already-seeded show.
- Add a migration whenever the database schema changes.
- Keep `ADMIN_EMAIL` server-side and verify it on every write route.
- Keep suggestions separate from official-set records.
- Mark originals explicitly so public YouTube and lyrics links stay hidden.
- Preserve the two intentional transition arrows unless the owner changes them.
- Describe 10:00 PM as the expected wrap, not a curfew.
- Do not add chord-sheet interfaces unless the product decision is explicitly
  revisited.
