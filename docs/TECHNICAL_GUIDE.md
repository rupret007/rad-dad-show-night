# Technical and Deployment Guide

## Purpose

This is a dynamic show-management application, not a static event flyer. The
public page reads the current official sets from a shared database, and the
owner can publish set changes through an authenticated browser interface.

## Production links

- Public site: <https://rad-dad-show-night.jeffstory007.chatgpt.site>
- Owner editor: <https://rad-dad-show-night.jeffstory007.chatgpt.site/show-control>
- GitHub: <https://github.com/rupret007/rad-dad-show-night>

## Application structure

| Path | Responsibility |
| --- | --- |
| `app/page.tsx` | Public event page and master run of show |
| `app/live-set-lists.tsx` | Live set rendering and 30-second refresh |
| `app/show-control/` | Owner-only song editor |
| `app/song-board.tsx` | Public suggestion form and feed |
| `app/api/show/route.ts` | Public show reads and authenticated set writes |
| `app/api/enrich/route.ts` | Authenticated YouTube lookup and search fallback |
| `app/api/suggestions/route.ts` | Canonical public suggestion GET and POST route |
| `lib/show-data.ts` | Event constants and initial confirmed songs |
| `lib/show-store.ts` | Database seeding, reads, and song hydration |
| `lib/admin-access.ts` | Owner email authorization |
| `lib/song-resources.ts` | YouTube URL parsing and resource-search URLs |
| `db/schema.ts` | Drizzle schema |
| `drizzle/0000_show_control.sql` | Initial D1 migration |
| `.openai/hosting.json` | Sites project and logical storage bindings |

## Runtime architecture

### Public page

The server renders the current set from D1. `LiveSetLists` then requests
`GET /api/show` every 30 seconds and after the tab returns to the foreground.
This lets an already-open page receive changes made in Show Control.

The public list renders YouTube and lyrics actions for songs not marked
original. Exact saved URLs take priority; otherwise it exposes targeted search
links. Original songs display neither resource.

If D1 is temporarily unavailable, the server returns the confirmed defaults in
`lib/show-data.ts` so the show plan does not disappear.

### Show Control

`/show-control` uses the platform's Sign in with ChatGPT flow. The page and all
official-set writes verify the authenticated email on the server. Client-side
buttons are convenience controls, not the authorization boundary.

The editor keeps changes in browser state until the owner saves the active set.
`POST /api/show` validates the payload, replaces that set in one D1 batch, and
returns the canonical saved rows.

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

## Database

The logical D1 binding is `DB`.

### `songs`

Stores the official set slug, position, title, artist, transition and original
states,
performance cue, key, tuning, YouTube information, rehearsal notes, updater,
and timestamps.

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

Production values belong in Sites environment settings. Do not put API keys in
Git, `.openai/hosting.json`, client components, or documentation.

When `YOUTUBE_API_KEY` is absent or lookup fails, the API returns a deterministic
YouTube search URL. The owner can choose and paste the correct version.

## API behavior

### `GET /api/show`

Public, read-only, and uncached. Returns show metadata, set definitions, songs,
and the most recent update timestamp.

### `POST /api/show`

Owner-only. Accepts one set slug and its full ordered song array. Positions are
recalculated server-side. Text lengths, known set slugs, URLs, and maximum set
size are validated before the D1 batch runs.

### `POST /api/enrich`

Owner-only. Accepts a title and artist. With `YOUTUBE_API_KEY`, it asks YouTube
for one embeddable, syndicated video. Without a key or match, it returns a safe
search fallback.

### `GET /api/suggestions`

Public. Reads and parses the connected Google Sheet CSV feed.

### `POST /api/suggestions`

Public. Validates the submission, checks for a duplicate when possible, and
submits it to the connected Google Form. Suggestions never write to D1.

## Authentication and security

- The public page and read APIs allow anonymous visitors.
- Show Control initiates Sign in with ChatGPT.
- Every official write independently checks the authenticated email.
- `ADMIN_EMAIL` is configured in the Sites runtime environment.
- YouTube credentials, if added, must be stored as a Sites secret.
- Public suggestion input is length-limited and includes a honeypot field.
- User-supplied resource links are limited to HTTP and HTTPS URLs.

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
