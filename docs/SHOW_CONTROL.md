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

Every show has a unique share link using `?show=show-slug`. Mark a draft
**Published** when it is ready for the band, and archive completed events to keep
the picker organized without deleting their history.

## Set Coach

Select **Review this set** to check estimated runtime, transitions, performance
cues, and missing exact practice references. Set Coach never changes song order
or publishes anything.

The smart timing review works without an AI key. When `OPENAI_API_KEY` is
configured, the same button adds a concise OpenAI review of pacing and handoffs.
Only the active set's titles and operational metadata are sent; lyrics are not.

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

The status bar at the bottom explains whether the active set matches the public
page or contains unsaved changes.

- **Save [set name]** publishes only the active set.
- Other sets with drafts remain unsaved.
- **Undo Remove** restores the most recently removed song before saving.
- Leaving the page with unsaved changes triggers a browser warning.
- The public page checks for updates every 30 seconds and whenever it becomes
  visible again.

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
Sheet. Use the backup Google Form linked on the public page if inline submission
is temporarily unavailable.

### The public order has not changed

Confirm that **Save [set name]** completed. Draft reordering does not become
public automatically.
