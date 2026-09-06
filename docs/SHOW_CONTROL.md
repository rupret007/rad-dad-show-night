# Show Control Owner Guide

Show Control is the private editing workspace for the official Rad Dad + Friends
set lists.

## Owner link

### [OPEN SHOW CONTROL](https://rad-dad-show-night.jeffstory007.chatgpt.site/show-control)

Sign in with ChatGPT using `jeffstory007@gmail.com`. Authentication is enforced
on the server, so hiding the link is not the security mechanism.

The public page is:
[rad-dad-show-night.jeffstory007.chatgpt.site](https://rad-dad-show-night.jeffstory007.chatgpt.site)

## What can be edited

Show Control manages these official sets:

- Jeff Story & Friends
- Stalemate
- Rad Dad

Mason / The Fault Lines retains a dedicated setup and performance window in the
master timeline, but its song list is not managed in Show Control.

## Reuse the site for another show

Use the show picker at the top of Show Control to switch events. Select **Clone
show** to copy the current timeline, sets, cues, song resources, original flags,
and durations into a new private draft. Enter the new date, venue, and title,
then create the draft.

Every show has a unique share link using `?show=show-slug`. The clone keeps its
own set rows. Later edits to the original show cannot change the draft, and the
public page will not paint another event's songs or set times onto it. Uncheck
**Copy official songs and set times** to start an empty night; that draft will
not inherit another show's set. Mark a draft **Published** when it is ready for
the band, and archive completed events to keep the picker organized without
deleting their history. The editor times come from this show's own verified
payload, not the September 19 defaults. Rehearsal notes stay in Show Control
and are not sent on public show reads.

Saving a set does not publish the show. Save writes this show's official list
in the database. Publish is the separate action that opens the public share
link. Archive closes that link. A draft or archived **See closed public link**
action opens the same not-found page a guest would see; it is not a public
preview and does not inherit another night's set.

Publishing opens that show's saved public share link; archiving closes it.
Show Control asks before either change and will not change lifecycle status
while any set has unsaved edits. The default public show cannot be archived:
the main link resolves only that record, and the product does not yet provide a
replacement-default workflow. Archive non-default shows instead.

Draft and archived links are private lifecycle records, not public previews.
Anonymous page and API reads return not found; the authenticated owner can still
load either status inside Show Control.

On a phone, the show picker, status badge, share-link action, and lifecycle
hint stay stacked above the set editor so Jeff can see whether the public link
is open before saving a set.

## Show status and one next step

The status deck directly below the show picker keeps three separate facts in
view: whether the public share link is open, how many verified songs and set
windows belong to this show, and that Travis owns booking and outreach outside
Show Control. The app never pitches, posts, or sends on his behalf.

The highlighted **One next step** follows a fixed order instead of guessing:

1. Check the first set whose last Save did not come back with a verified
   official list.
2. Save the first set with unsaved changes.
3. If this show has no verified songs, focus the first set's Add Song field.
4. If saved songs belong to a draft or archived show, offer the existing
   confirmed **Publish saved show** action.
5. If the saved show is already public, open its phone-friendly band run mode.

If the set definitions do not verify, the card offers no action. An empty show
stays empty and never borrows another night's songs or set times.

## Leftover on this show

Under the one next step, leftover work on this verified night stays listed and
tappable. Leftover items reuse existing owner actions. They do not invent a
booking, outreach, or send path.

Leftover order is fixed:

1. Leftover unverified saves after the first leftover check. Each leftover
   check reloads that leftover set's official list before another write.
2. Leftover unsaved sets after the first leftover save. Each leftover save
   writes that leftover set through the existing authenticated save path.
3. Leftover empty sets on this show. Each leftover start focuses that leftover
   set's Add Song field. The leftover set stays empty until the owner adds a
   song here.
4. Leftover share-link proof: **See closed public link** on a draft or archive,
   **See last saved public list** when leftover unsaved work is still private
   on a published show, or **See live empty public list** when this leftover
   public night is open and empty.

A leftover empty clone does not inherit another night's songs or set times.
Leftover owner copy stays in Show Control and does not appear on public pages.

If the initial owner show payload itself cannot be verified, Show Control stops
before rendering the editor and offers **Retry verified load**. Add, Save,
Publish, and Archive are unavailable until that exact show loads successfully.

## Set Coach

Select **Review this set** to check estimated runtime, transitions, performance
cues, and missing exact practice references. The panel names the show, set, and
browser draft it reviews. Advice disappears when you edit that draft, switch
sets, or switch shows; choose **Review this set again** for current advice. A
late response from an earlier review cannot replace it. Set Coach does not save,
change song order, or publish anything.

The scheduled window comes only from this show's selected set time. Blank,
ambiguous, or malformed times show **Scheduled window unknown** and **Timing not
scored**, alongside the estimated runtime and other readiness findings. Coach
does not borrow another night's schedule. The estimate uses the draft's song
durations, not measured rehearsal time.

A review has a ten-second deadline including its response body. A failed or
unverified response keeps the draft and offers **Retry review**. Retries require
a click; changing drafts never starts a review automatically.

The smart timing review works without an AI key. When `OPENAI_API_KEY` is
configured, the same button adds a concise OpenAI review of pacing and handoffs.
Only the active set's titles and operational metadata are sent; lyrics are not.

## Public list review

The editor names what the public share link will show for this browser draft.
That review uses the same saved-media contract as the public page:

- Covers show YouTube or lyrics only when a saved direct URL is on the song.
- Search links stay in Show Control. They are labeled **Search YouTube** or
  **Search lyrics**, not as public actions.
- Songs marked **Original / hide resources** hide both on the public list.
- Rehearsal notes stay in Show Control.

An empty set says so. It does not borrow another night's songs or media. This
review does not save or publish. Save and Check remain the existing write path.

For every editable song, the owner can change:

- Song title and artist
- Position in the set
- Intentional flow into the next song
- Original-song resource policy
- Performance or guest cue
- Key and tuning
- YouTube link
- Lyrics link
- Band-owned rehearsal notes

## Add a song

1. Choose the set that should receive the song.
2. Enter the title and artist in **Add a song**.
3. Select **Add + find**.
4. The song is added to the bottom of the draft.
5. Show Control attempts to find YouTube automatically when the optional API
   connection is available. Otherwise it prepares a YouTube search.
6. Paste the exact video URL if the search result is not the band's preferred
   version.
7. Move the song into position and save the set.

Adding a song creates a draft. It is not public until that set is saved.

## Reorder songs

On desktop, drag a song using the `||` handle. On desktop or mobile, use
**Move Up** and **Move Down**.

Position numbers are recalculated automatically. Press **Save** after the order
is correct.

Saving an existing song now keeps its identity, including when you change its
position, key, or cue. A performer using band run mode stays on that song after
the public refresh, and Next follows the updated order. New additions get new
identities. If you remove the selected song, the performer must choose a new
place; the site never advances for them. Each person's marker is local to their
device, not a shared live-stage command. This does not protect two owner tabs
from overwriting each other's set; see the [handoff limits](RUN_POSITION_HANDOFF.md).

## Preserve a transition

Enable **Flows to next** when one song should continue directly into the next.
The public page displays the transition as `&rarr;`.

For the confirmed Rad Dad set, the intentional transitions are:

- First Date &rarr; Chick Magnet
- The Way I Love You &rarr; The Story Of Us

## Add the preferred YouTube version

Open a song's detail panel and paste a normal YouTube, `youtu.be`, Shorts, Live,
or embed URL into **YouTube video**. Show Control extracts the video ID and
enables a private preview.

The public page uses links rather than embedding every video. This keeps the set
list fast and uncluttered on phones.

Covers display YouTube and lyrics actions only when the official set has a
saved direct URL. Missing media fails closed. A local covers table is not the
set. Songs marked **Original / hide resources** display neither action.

The confirmed originals are The Drinking Song, all Stalemate songs, and The Way
I Love You. The remaining Rad Dad songs are covers and can show both resources
when a direct URL exists.

Without a configured YouTube Data API key, **Find YouTube** opens or prepares a
search instead of choosing a video without the owner's review. This is the
expected fallback behavior.

## Use rehearsal details

Open **Details, YouTube, and rehearsal notes** on a song to store:

- Guest assignments
- Count-ins and endings
- Key changes
- Tuning
- Arrangement or harmony notes
- The exact practice-video link

The public page displays performance cues, keys, and tuning. Rehearsal notes are
kept in the official song record for the band editor.

## Work with public suggestions

The right-side **Suggestion inbox** contains songs submitted on the public page.
It is independent of the official show load. If the public feed is unavailable,
the owner can still work with the verified show. The inbox keeps any last
checked ideas, labels the interruption, and blocks copying stale rows until
**Refresh suggestions** succeeds. A failed read never means "No suggestions yet."

1. Choose the destination set.
2. Select **Add to [set name]** on the suggestion.
3. Review its title, artist, YouTube link, and notes.
4. Place it in the desired order.
5. Save the set only if it is officially approved.

A suggestion never changes the official set by itself.

The suggestion form assumes a song is a cover. Submitters check **This is an
original / unreleased song** when appropriate. Cover suggestions run the normal
resource lookup when moved into a draft; checked originals enter Show Control
with YouTube and lyrics hidden.

## Save and publish

The status bar at the bottom explains whether the active set is saved, and
whether this show's public share link is open.

- **Save [set name]** writes only the active set for this show.
- The editor sends the last verified official-set receipt and persistent write
  version. Two tabs cannot replace the same reviewed version, even for an empty
  set. The losing draft remains here until **Check saved [set]** reads the winner.
- When that list differs, Check displays **Saved list** beside **Your browser
  draft**, including changed cues and notes. Save remains blocked until you
  choose. **Use saved list** replaces only the browser draft. **Keep my draft**
  stages the whole browser list as a replacement; it does not merge by title.
  Songs removed by the other save are named before this choice recreates them
  as new draft rows. Neither choice sends a save request. Review, choose, then
  press Save separately if you kept the draft.
- If someone saves again before your replacement, Check is required again.
  A failed or malformed Check never authorizes another write.
- Owner checks require a current authenticated response; an offline copy is
  not enough. Publish and Archive stay blocked during an unresolved save,
  check, or comparison, including when the set has no other unsaved edits.
- Edits typed while Save is in flight stay in this browser. The sent list can
  still write; later edits stay unsaved.
- If the write may have landed without a verified official list, Save stays
  blocked until **Check saved [set]** runs. Nothing auto-retries.
- On a published show, that save updates the public share link.
- On a draft or archived show, that save stays private until **Publish saved show**.
- Other sets with unsaved edits remain unsaved.
- **Undo Remove** restores a song only on the show and set that removed it.
- Leaving the page with unsaved changes triggers a browser warning.
- The public page checks for updates every 30 seconds and whenever it becomes
  visible again.

The conflict-safe save/review change is source-only until an approved deployment
includes migration `0003_official_set_revisions.sql`. An older page must reload
to obtain the new write version. Missing database migration or owner write
metadata fails closed; it never falls back to a repository list for editing.

## Troubleshooting

### Show Control says the account cannot edit

Sign out and sign back in with `jeffstory007@gmail.com`. The production
`ADMIN_EMAIL` environment value must match that address.

### A song has no YouTube or lyrics buttons on the public page

Confirm whether **Original / hide resources** is enabled. That is correct for an
original. For a cover, turn it off, choose the preferred YouTube and lyrics
pages when available, and save.

### A suggestion is missing

The suggestion board depends on its connected public Google Form and response
Sheet. A form response is not proof that the Sheet has published the idea yet.
Use **Refresh board** on the public page or **Refresh suggestions** in the inbox.
If a submission may already have arrived, do not immediately submit it again or
use the backup form: a second write can create a duplicate. The public page
keeps the draft and offers an explicit, warned retry after checking the board.
Its draft is held only in that open page, not saved across a reload.

### The public order has not changed

Confirm that **Save [set name]** completed. Draft reordering does not become
public automatically.
