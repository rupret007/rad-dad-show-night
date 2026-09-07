# Empty-clone night hours

Grok Cloud, September 6, 2026. Base:
`d388d96394df79de18e18a57bcbd6daede82f803`, after #25.
Branch: `cursor/empty-clone-night-hours-bf25`.
Coordination: [Bob-the-Bot #11](https://github.com/rupret007/Bob-the-Bot/issues/11).
Source for draft review; this does not update the live Sites deployment.

## Product problem and change

Empty clones already refused songs and `show_blocks` set windows. The clone
write still copied the source show's `start_time`, `end_time`, and
`expected_wrap`. Leftover **See live empty public list** / **See closed public
link** could therefore show September 19's 7:00-10:00 PM wrap on a night with
no official set. Show Control also had no hours fields.

The existing Clone form now collects optional start and end times:

- Empty clone writes blank hours unless both clocks are entered.
- One entered time is ignored. It does not inherit the missing clock.
- A full copy keeps the source hours unless both clocks are entered.
- Show Control names this night's hours or says they are not set.
- The public Time fact uses the same contract. Blank clocks stay blank instead
  of becoming `"-"`.

This does not save a set, publish, book, or send. Save, Check, Coach, and
public-media review stay on their existing paths.

## Reused boundaries

- Current owner-only `POST /api/shows` clone, `shouldCopyCloneSongs`, leftover
  share-link proof, and hosted empty-clone fixture.
- No new schema, leftover action, provider, or credential.
- Suggestions still cannot mutate official sets. Travis still books. Nothing
  pitches or posts.

`lib/show-data.ts` remains blob `7ff0a69708ccfac79aa9b35878670f31bbb83b64`.
Migration `0003` remains a separately approved Jeff-only live D1 rollout.

## Verification and limits

Run the repository's full test/build, lint, focused types, browser, disposable
D1, and local leftover-hosted gates. The PR and coordination AFTER record the
executed counts, exact tip, and hosted run.

Live owner sign-in, Sites, and provider enrich were not tested. Source push
does not deploy Sites. Set windows inside a copied timeline remain a separate
copy-songs choice; this slice only stops show-level hours from leaking onto an
empty night.
