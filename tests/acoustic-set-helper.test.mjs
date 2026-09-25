import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_SONGS } from "../lib/show-data.ts";
import {
  assessTbdAcousticSlot,
  findTbdAcousticSlot,
  KNOWN_TBD_ACOUSTIC_OPTIONS,
} from "../lib/acoustic-set-helper.ts";

const helperUrl = new URL("../lib/acoustic-set-helper.ts", import.meta.url);
const componentUrl = new URL("../app/show-control/acoustic-slot-helper.tsx", import.meta.url);
const controlUrl = new URL("../app/show-control/show-control.tsx", import.meta.url);
const stylesUrl = new URL("../app/show-control/show-control.module.css", import.meta.url);
const guideUrl = new URL("../docs/SHOW_CONTROL.md", import.meta.url);

const seededAt = "2026-08-09T00:00:00.000Z";

function song(id, setSlug, position, title, options = {}) {
  return {
    id,
    showId: "fixture-show",
    setSlug,
    position,
    title,
    artist: "",
    transition: false,
    isOriginal: false,
    durationSeconds: 180,
    performanceNote: "",
    songKey: "",
    tuning: "",
    youtubeUrl: "",
    youtubeVideoId: "",
    chordsUrl: "",
    lyricsUrl: "",
    rehearsalNotes: "",
    updatedAt: seededAt,
    ...options,
  };
}

function openingSet(overrides = []) {
  const base = [
    song(1, "jeff-story-friends", 1, "The Drinking Song"),
    song(2, "jeff-story-friends", 2, "Acoustic song - TBD"),
    song(3, "jeff-story-friends", 3, "Anyone Else but You"),
    song(4, "jeff-story-friends", 4, "We're Going to Be Friends"),
    song(5, "jeff-story-friends", 5, "Heart-Shaped Box"),
    song(6, "jeff-story-friends", 6, "Creep"),
  ];
  return base.map((entry) => {
    const patch = overrides.find((o) => o.id === entry.id);
    return patch ? { ...entry, ...patch } : entry;
  });
}

test("finds the TBD slot in the opening set by position, not by guessing", () => {
  const slot = findTbdAcousticSlot(openingSet());
  assert.equal(slot.hasTbdSlot, true);
  assert.deepEqual(slot.song, { id: 2, position: 2, title: "Acoustic song - TBD" });
});

test("reports no TBD slot once the placeholder title is replaced", () => {
  const resolved = openingSet([{ id: 2, title: "Badfish" }]);
  const slot = findTbdAcousticSlot(resolved);
  assert.equal(slot.hasTbdSlot, false);
  assert.equal(slot.song, null);
});

test("ignores songs outside Jeff Story & Friends", () => {
  const otherSet = [song(9, "rad-dad", 1, "Some TBD cover")];
  const slot = findTbdAcousticSlot(otherSet);
  assert.equal(slot.hasTbdSlot, false);
});

test("computes the remaining time budget from the confirmed songs and the set's own window", () => {
  const result = assessTbdAcousticSlot({ songs: openingSet(), setTime: "7:00-7:35 PM" });
  assert.equal(result.slot.hasTbdSlot, true);
  assert.equal(result.scheduledMinutes, 35);
  assert.equal(result.confirmedSeconds, 5 * 180);
  assert.equal(result.remainingSeconds, 35 * 60 - 5 * 180);
  assert.equal(result.decisionRequired, true);
});

test("never guesses a runtime: unconfirmed candidate durations are flagged, not scored", () => {
  const result = assessTbdAcousticSlot({ songs: openingSet(), setTime: "7:00-7:35 PM" });
  assert.equal(result.candidates.length, KNOWN_TBD_ACOUSTIC_OPTIONS.length);
  for (const candidate of result.candidates) {
    assert.equal(candidate.fit, "duration-unconfirmed");
    assert.match(candidate.detail, /No confirmed rehearsed runtime/);
  }
});

test("scores a candidate with a confirmed runtime against the remaining budget", () => {
  const remaining = 35 * 60 - 5 * 180;
  const result = assessTbdAcousticSlot({
    songs: openingSet(),
    setTime: "7:00-7:35 PM",
    candidates: [
      { id: "fits", title: "Fits Fine", estimatedSeconds: 150 },
      { id: "tight", title: "Right At The Line", estimatedSeconds: remaining },
    ],
  });
  assert.equal(result.candidates[0].fit, "fits");
  assert.match(result.candidates[0].detail, /Fits with about/);
  assert.equal(result.candidates[1].fit, "fits");
  assert.match(result.candidates[1].detail, /Fits with about 0 minutes/);
});

test("flags a candidate that would blow the remaining time budget", () => {
  const remaining = 35 * 60 - 5 * 180;
  const result = assessTbdAcousticSlot({
    songs: openingSet(),
    setTime: "7:00-7:35 PM",
    candidates: [{ id: "long", title: "Epic Jam", estimatedSeconds: remaining + 125 }],
  });
  assert.equal(result.candidates[0].fit, "over-budget");
  assert.match(result.candidates[0].detail, /3 minutes over/);
});

test("does not score fit when the set has no confirmed start-to-end window", () => {
  const result = assessTbdAcousticSlot({
    songs: openingSet(),
    setTime: "",
    candidates: [{ id: "known", title: "Known Runtime", estimatedSeconds: 120 }],
  });
  assert.equal(result.scheduledMinutes, null);
  assert.equal(result.remainingSeconds, null);
  assert.equal(result.candidates[0].fit, "window-unconfirmed");
});

test("an already-resolved slot returns no candidates, checklist, or decision requirement", () => {
  const resolved = openingSet([{ id: 2, title: "Badfish", isOriginal: false }]);
  const result = assessTbdAcousticSlot({ songs: resolved, setTime: "7:00-7:35 PM" });
  assert.equal(result.decisionRequired, false);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.readinessChecklist, []);
});

test("the readiness checklist never auto-picks a song and always ends with the real save step", () => {
  const result = assessTbdAcousticSlot({ songs: openingSet(), setTime: "7:00-7:35 PM" });
  assert.equal(result.readinessChecklist.length > 0, true);
  assert.doesNotMatch(result.readinessChecklist.join(" "), /Badfish is chosen|Nutshell is chosen/);
  assert.equal(
    result.readinessChecklist.at(-1),
    "Save Jeff Story & Friends in Show Control to make the pick official.",
  );
});

test("an empty candidate list adds an explicit 'none recorded' checklist item", () => {
  const result = assessTbdAcousticSlot({ songs: openingSet(), setTime: "7:00-7:35 PM", candidates: [] });
  assert.deepEqual(result.candidates, []);
  assert.equal(
    result.readinessChecklist.some((item) => /No candidate songs recorded yet/.test(item)),
    true,
  );
});

test("the real September 19 opening set (from show-data) still has an open TBD decision", () => {
  const result = assessTbdAcousticSlot({ songs: DEFAULT_SONGS, setTime: "7:00-7:35 PM" });
  assert.equal(result.slot.hasTbdSlot, true);
  assert.equal(result.slot.song.title, "Acoustic song - TBD");
  assert.equal(result.decisionRequired, true);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(
    result.candidates.map((c) => c.title).sort(),
    ["Badfish", "Nutshell"],
  );
});

test("the helper module never mutates its input songs array", () => {
  const songs = openingSet();
  const before = JSON.stringify(songs);
  assessTbdAcousticSlot({ songs, setTime: "7:00-7:35 PM" });
  assert.equal(JSON.stringify(songs), before);
});

test("the Acoustic Slot Helper panel is wired into Show Control for the opening set only", async () => {
  const [component, control, styles, guide] = await Promise.all([
    readFile(componentUrl, "utf8"),
    readFile(controlUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
    readFile(guideUrl, "utf8"),
  ]);
  assert.match(component, /assessTbdAcousticSlot/);
  assert.match(component, /export default function AcousticSlotHelper/);
  assert.match(control, /import AcousticSlotHelper from ".\/acoustic-slot-helper"/);
  assert.match(control, /activeSet === "jeff-story-friends" \? \(\s*<AcousticSlotHelper/);
  assert.match(styles, /\.acousticHelperPanel/);
  assert.match(guide, /Acoustic slot helper/i);
  assert.match(guide, /never (auto-)?picks?|never chooses|does not choose/i);
});

test("the acoustic helper module documents itself as read-only and non-guessing", async () => {
  const source = await readFile(helperUrl, "utf8");
  assert.match(source, /Never (writes|guesses)/i);
  assert.match(source, /never auto-selects/i);
});
