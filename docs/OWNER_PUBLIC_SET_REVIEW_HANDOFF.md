# Public-list review on the owner draft

Grok Cloud, September 6, 2026. Base:
`76fcebaaadc97929c1f73287c8a767df2a5a27ae`, after #24.
Branch: `cursor/owner-public-set-review-90da`.
Coordination: [Bob-the-Bot #11](https://github.com/rupret007/Bob-the-Bot/issues/11).
Source for draft review; this does not update the live Sites deployment.

## Product problem and change

The public live list already fails closed: covers show YouTube and lyrics only
from saved official URLs, and originals hide both. Show Control still labeled
search fallbacks **Open YouTube** and **Open lyrics**. An owner reviewing a set
therefore saw a covers wall that guests will not see. Rehearsal notes were also
indistinguishable from public cues.

The existing editor now names the public list for this browser draft:

- Saved YouTube and lyrics are labeled as saved and counted as public.
- Search links stay in Show Control and are labeled **Search YouTube** /
  **Search lyrics**.
- Originals hide both on the public list.
- Rehearsal notes stay in Show Control.
- An empty set stays empty. It does not borrow another night.

This review does not save, publish, book, or send. Set Coach, Save, Check, and
conflict comparison stay on their existing paths.

## Reused boundaries

- `publicSongResourceActions` and `savedOfficialMediaUrl` from the public media
  contract. No new schema, provider, or credential.
- Current Show Control song cards and owner authentication.
- Suggestions still cannot mutate official sets. Travis still books. Nothing
  pitches or posts.

`lib/show-data.ts` remains blob `7ff0a69708ccfac79aa9b35878670f31bbb83b64`.
Migration `0003` remains a separately approved Jeff-only live D1 rollout.

## Verification and limits

Run the repository's full test/build, lint, focused types, browser, and local D1
gates. The PR and coordination AFTER record the executed counts, exact tip, and
hosted run.

Live owner sign-in, Sites, and provider enrich were not tested. Source push does
not deploy Sites. Optional Find resources still prepares a search when no API
key is configured; that search is not stored as official media.
