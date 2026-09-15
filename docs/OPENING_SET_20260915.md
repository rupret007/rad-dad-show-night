# September 19 opening-set revision — September 15

Jeff requested two solo acoustic songs to start, followed by two duets with
Candace. Remove the unrehearsed Zella songs. The revised source baseline is in
`lib/show-data.ts` and [SHOW_PLAN.md](SHOW_PLAN.md).

## Intended running order

| Position | Song | Performer cue |
| --- | --- | --- |
| 1 | The Drinking Song | Jeff — solo acoustic opener; original |
| 2 | Acoustic song — TBD | Jeff — solo acoustic; second song to be chosen |
| 3 | Anyone Else but You — The Moldy Peaches | Jeff and Candace — duet |
| 4 | We're Going to Be Friends — The White Stripes | Jeff and Candace — duet |
| 5 | Heart-Shaped Box — Nirvana | Travis Story — guitar |
| 6 | Creep — Radiohead | Carly — vocals / Travis Worsham — guitar |

Badfish and Nutshell remain possible choices for slot 2, not extra confirmed
songs. Just a Girl and Misery Business are removed. No guest-song key, tuning,
exact duration, or media link has been guessed. The other sets and run-of-show
windows stay as scheduled.

## Apply to the saved live set

**Source prepared; live owner save pending.** The public API was checked read-only
on September 15 and still returned the previous seven-song opening set. A GitHub
push or changed seed cannot replace that saved list. Do not change the seed key,
reseed the database, or run a deployment or migration to edit a setlist.

1. Open [Show Control](https://rad-dad-show-night.jeffstory007.chatgpt.site/show-control)
   with Jeff's authorized account. Select the September 19 Guitars & Growlers
   show and **Jeff Story & Friends**. Read the current saved list first; preserve
   any newer notes, media, durations, and other owner edits on retained songs.
2. Move **The Drinking Song** to position 1 and keep its Original flag.
3. Replace the two earlier solo choices with one **Acoustic song - TBD** slot
   until Jeff chooses. Preserve any useful Badfish/Nutshell rehearsal notes
   before removing their rows. Do not silently select either song for Jeff.
4. Remove **Just a Girl** and **Misery Business**. Add the two Candace duets as
   new songs, with the artists and performer cues above. Never rename a Zella
   row into a different song; removed-song identities must stay removed.
5. Place the duets immediately after Jeff's two solo slots. Keep Heart-Shaped
   Box and Creep afterward, preserving their saved identities and details.
6. Review the six slots, then **Save Jeff Story & Friends**. This published
   show's public list updates through that owner save. If a conflict or
   uncertain save appears, check the saved list before retrying.
7. Refresh [the public page](https://rad-dad-show-night.jeffstory007.chatgpt.site)
   and confirm the order, both Candace cues, and absence of the two Zella songs.
   Check that Stalemate, Rad Dad, and the timeline are unchanged.

No owner session or live database write is part of this source revision.
Migration 0003 remains Jeff-only; no deployment, merge, signing, posting, or
booking is needed for this content edit. Travis books; NEVER_AUTO_POST.

## Source verification

- Production build passed; existing isolation tests 207/207 and local D1 tests
  20/20 passed. Updated the existing count/resume expectations for this set.
- Lint and the focused suggestion typecheck passed. Local lint excludes unrelated
  nested `.claude` worktrees, which are not part of the tracked source or CI.
- The actual public list component rendered this revised data at 1280px and
  390px: six ordered opening slots, both Candace cues, no removed Zella songs,
  unchanged six-song Stalemate and nineteen-song Rad Dad lists, no horizontal
  overflow, no page errors, and no external/API writes. The fixture used local
  port 4336 and an isolated Chrome profile.
- These checks verify the source revision, not a live owner save. Hosted status
  and the exact pushed tip are recorded in the draft PR and coord #11.
