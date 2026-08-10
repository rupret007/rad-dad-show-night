# Rad Dad + Friends Show Night

The shared show-night hub for **Rad Dad + Friends** at **Guitars & Growlers** on
**Saturday, September 19, 2026, from 7:00-10:00 PM**.

<p align="center">
  <img src="public/rad-dad-friends-flyer.png" alt="Rad Dad and Friends show flyer" width="420">
</p>

## Open the site

### [OPEN THE PUBLIC SHOW PAGE](https://rad-dad-show-night.jeffstory007.chatgpt.site)

The public page is the link to send performers, friends, and guests. It includes
the master timeline, current official sets, production notes, YouTube links, and
the public suggestion board.

### [OPEN PRIVATE SHOW CONTROL](https://rad-dad-show-night.jeffstory007.chatgpt.site/show-control)

Show Control is the owner-only editor. Sign in with ChatGPT using
`jeffstory007@gmail.com` to add, edit, remove, and reorder songs. Saving a set
updates the public page without requiring a code change or GitHub commit.

## What the site does

- Manages multiple shows from one owner dashboard.
- Clones a complete show into a new private draft.
- Gives every show its own shareable public link and lifecycle status.
- Keeps the complete 7:00-10:00 PM run of show in one place.
- Stores the official set lists in a shared production database.
- Lets the owner reorder songs by dragging or using Move Up and Move Down.
- Preserves intentional song-flow arrows and performer cues.
- Stores keys, tunings, endings, and private rehearsal notes per song.
- Shows YouTube and lyrics resources for covers while originals can hide them.
- Refreshes the public set lists automatically while the page is open.
- Collects public song ideas without allowing suggestions to alter the set.
- Assumes suggestions are covers unless the submitter marks one original.
- Protects all official-set changes behind owner authentication.
- Keeps the established black, electric-blue, lime, and hot-pink Rad Dad brand.
- Estimates set runtime from per-song durations.
- Runs Set Coach for timing, transitions, guest load, and readiness checks.

Chord-sheet features are intentionally not included. Covers receive YouTube and
lyrics resources; songs marked original hide both while retaining the band's
own rehearsal notes.

## Documentation

- [Show Control owner guide](docs/SHOW_CONTROL.md)
- [Canonical show plan and set lists](docs/SHOW_PLAN.md)
- [Technical, data, security, and deployment guide](docs/TECHNICAL_GUIDE.md)

## Quick owner workflow

1. Open [Show Control](https://rad-dad-show-night.jeffstory007.chatgpt.site/show-control).
2. Sign in with the authorized ChatGPT account.
3. Choose **Jeff Story & Friends**, **Stalemate**, or **Rad Dad**.
4. Add a song, edit its details, or move it into position.
5. Paste the exact YouTube version when you have one.
6. Mark **Original / hide resources** when YouTube and lyrics do not apply.
7. Turn on **Flows to next** when the transition arrow is intentional.
8. Press **Save** for that set to publish it.

Unsaved changes remain private in the browser. Public suggestions also remain
separate until the owner deliberately adds one to a draft and saves it.

## Local development

Requirements: a current Node.js installation and npm.

```bash
npm ci
npm run dev
```

Create a local `.env` when testing authenticated or automatic YouTube features:

```bash
ADMIN_EMAIL=jeffstory007@gmail.com
YOUTUBE_API_KEY=
```

`ADMIN_EMAIL` is required for owner writes. `YOUTUBE_API_KEY` is optional. When
the key is absent, Show Control creates a YouTube search link and lets the owner
paste the preferred video URL.

Set Coach always provides a local smart review. Add `OPENAI_API_KEY` as a Sites
secret to enable the optional AI review, and optionally set `OPENAI_MODEL`
(default: `gpt-5.4-mini`).

Build the production application with:

```bash
npm run build
```

## Hosting

The production application is hosted with OpenAI Sites rather than GitHub
Pages. GitHub is the public source repository; Sites supplies the server routes,
owner sign-in, environment variables, and D1 database required by the live
editor.

Pushing code to `main` keeps the repository current but does not, by itself,
replace the Sites production deployment. Changes made inside Show Control are
database updates and appear publicly without a GitHub deployment.

## Source of truth

- Live set data: Sites D1 database
- Show records and cloned timelines: Sites D1 database
- Initial confirmed set data: `lib/show-data.ts`
- Database schema: `db/schema.ts`
- Database migration: `drizzle/0000_show_control.sql`
- Public suggestions: connected Google Form and response Sheet
- Canonical human-readable plan: [docs/SHOW_PLAN.md](docs/SHOW_PLAN.md)

The expected finish is around 10:00 PM. It is a planned wrap time, not a venue
curfew.
