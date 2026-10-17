import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { DEFAULT_SONGS } from "../lib/show-data.ts";
import {
  assessTbdAcousticSlot,
  confirmedSetTime,
  DESIGNATED_ACOUSTIC_SLOT_POSITION,
  findTbdAcousticSlot,
  KNOWN_TBD_ACOUSTIC_OPTIONS,
  parseSetTimeSlot,
  relateTimeSlots,
  SHOW_SLOT_TIME_ZONE,
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

test("adjacent TBD-looking titles do not steal the designated acoustic slot", () => {
  const songs = openingSet([
    { id: 1, title: "Guest TBD cameo" },
    { id: 3, title: "Another TBD cover" },
  ]);
  const slot = findTbdAcousticSlot(songs);
  assert.equal(DESIGNATED_ACOUSTIC_SLOT_POSITION, 2);
  assert.equal(slot.hasTbdSlot, true);
  assert.deepEqual(slot.song, { id: 2, position: 2, title: "Acoustic song - TBD" });
});

test("an adjacent TBD-looking title is ignored once the designated slot is resolved", () => {
  const songs = openingSet([
    { id: 1, title: "Guest TBD cameo" },
    { id: 2, title: "Badfish" },
  ]);
  const slot = findTbdAcousticSlot(songs);
  assert.equal(slot.hasTbdSlot, false);
  assert.equal(slot.song, null);
});

test("an exact Acoustic song - TBD title outside position 2 never opens the helper", () => {
  const songs = openingSet([
    { id: 2, title: "Nutshell" },
    { id: 4, title: "Acoustic song - TBD" },
  ]);
  const slot = findTbdAcousticSlot(songs);
  assert.equal(DESIGNATED_ACOUSTIC_SLOT_POSITION, 2);
  assert.equal(slot.hasTbdSlot, false);
  assert.equal(slot.song, null);

  const result = assessTbdAcousticSlot({ songs, setTime: "7:00-7:35 PM" });
  assert.equal(result.decisionRequired, false);
  assert.deepEqual(result.candidates, []);
  assert.deepEqual(result.readinessChecklist, []);
});

test("a lone placeholder at position 1, 3, or 5 is ignored without title-guessing", () => {
  for (const position of [1, 3, 5]) {
    const songs = [
      song(1, "jeff-story-friends", 1, position === 1 ? "Acoustic song - TBD" : "The Drinking Song"),
      song(2, "jeff-story-friends", 2, "Nutshell"),
      song(3, "jeff-story-friends", 3, position === 3 ? "Acoustic song - TBD" : "Anyone Else but You"),
      song(5, "jeff-story-friends", 5, position === 5 ? "Acoustic song - TBD" : "Heart-Shaped Box"),
    ];
    const slot = findTbdAcousticSlot(songs);
    assert.equal(slot.hasTbdSlot, false, `position ${position}`);
    assert.equal(slot.song, null, `position ${position}`);
  }
});

test("when several placeholders exist, only the designated position 2 slot is used", () => {
  const songs = [
    song(11, "jeff-story-friends", 1, "Acoustic song - TBD"),
    song(2, "jeff-story-friends", 2, "Acoustic song - TBD"),
    song(10, "jeff-story-friends", 3, "Acoustic song - TBD"),
  ];
  const slot = findTbdAcousticSlot(songs);
  assert.equal(slot.hasTbdSlot, true);
  assert.deepEqual(slot.song, { id: 2, position: 2, title: "Acoustic song - TBD" });
});

test("overlapping songs at the designated position keep the placeholder, not the neighbor", () => {
  const songs = [
    ...openingSet(),
    song(20, "jeff-story-friends", 2, "Nutshell leftover"),
  ];
  const slot = findTbdAcousticSlot(songs);
  assert.equal(slot.hasTbdSlot, true);
  assert.deepEqual(slot.song, { id: 2, position: 2, title: "Acoustic song - TBD" });
});

test("overlapping placeholders at the designated position stay a TBD decision without guessing a fill", () => {
  const songs = [
    ...openingSet(),
    song(21, "jeff-story-friends", 2, "Acoustic song - TBD"),
  ];
  const slot = findTbdAcousticSlot(songs);
  assert.equal(slot.hasTbdSlot, true);
  assert.equal(slot.song.position, 2);
  assert.equal(slot.song.title, "Acoustic song - TBD");
  assert.equal(["2", "21"].includes(String(slot.song.id)), true);
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

test("missing or incomplete times stay window-unconfirmed instead of inventing minutes", () => {
  for (const setTime of ["", "   ", "7:00 PM", "7:00-7:35", null, undefined]) {
    const result = assessTbdAcousticSlot({
      songs: openingSet(),
      setTime: setTime ?? "",
      candidates: [{ id: "known", title: "Known Runtime", estimatedSeconds: 120 }],
    });
    assert.equal(parseSetTimeSlot(setTime), null, String(setTime));
    assert.equal(result.scheduledMinutes, null, String(setTime));
    assert.equal(result.remainingSeconds, null, String(setTime));
    assert.equal(result.candidates[0].fit, "window-unconfirmed", String(setTime));
  }
});

test("show-zone labels keep America/Chicago wall-clock minutes and do not convert", () => {
  const expected = parseSetTimeSlot("7:00-7:35 PM");
  assert.deepEqual(expected, {
    startMinutes: 19 * 60,
    endMinutes: 19 * 60 + 35,
    durationMinutes: 35,
    timeZone: SHOW_SLOT_TIME_ZONE,
  });
  assert.equal(SHOW_SLOT_TIME_ZONE, "America/Chicago");
  for (const labeled of ["7:00-7:35 PM CDT", "7:00-7:35 PM CST", "7:00-7:35 PM CT", "7:00-7:35 PM America/Chicago"]) {
    assert.deepEqual(parseSetTimeSlot(labeled), expected, labeled);
    const result = assessTbdAcousticSlot({ songs: openingSet(), setTime: labeled });
    assert.equal(result.scheduledMinutes, 35, labeled);
    assert.equal(result.remainingSeconds, 35 * 60 - 5 * 180, labeled);
  }
});

test("a foreign timezone is rejected rather than converted", () => {
  for (const foreign of ["7:00-7:35 PM UTC", "7:00-7:35 PM EST", "7:00-7:35 PM PT", "7:00-7:35 PM Europe/London"]) {
    assert.equal(parseSetTimeSlot(foreign), null, foreign);
    const result = assessTbdAcousticSlot({
      songs: openingSet(),
      setTime: foreign,
      candidates: [{ id: "known", title: "Known Runtime", estimatedSeconds: 120 }],
    });
    assert.equal(result.scheduledMinutes, null, foreign);
    assert.equal(result.candidates[0].fit, "window-unconfirmed", foreign);
  }
});

test("adjacent time windows are not merged into one longer set budget", () => {
  const opening = parseSetTimeSlot("7:00-7:35 PM");
  const changeover = parseSetTimeSlot("7:35-7:45 PM");
  assert.equal(relateTimeSlots(opening, changeover), "adjacent");
  assert.equal(confirmedSetTime(["7:00-7:35 PM", "7:35-7:45 PM"]), "");
  const result = assessTbdAcousticSlot({
    songs: openingSet(),
    setTime: ["7:00-7:35 PM", "7:35-7:45 PM"],
    candidates: [{ id: "known", title: "Known Runtime", estimatedSeconds: 120 }],
  });
  assert.equal(result.scheduledMinutes, null);
  assert.equal(result.candidates[0].fit, "window-unconfirmed");
});

test("overlapping time windows are not merged or scored", () => {
  const opening = parseSetTimeSlot("7:00-7:40 PM");
  const next = parseSetTimeSlot("7:35-7:45 PM");
  assert.equal(relateTimeSlots(opening, next), "overlap");
  assert.equal(confirmedSetTime(["7:00-7:40 PM", "7:35-7:45 PM"]), "");
  const result = assessTbdAcousticSlot({
    songs: openingSet(),
    setTime: ["7:00-7:40 PM", "7:35-7:45 PM"],
  });
  assert.equal(result.scheduledMinutes, null);
  assert.equal(result.remainingSeconds, null);
});

test("equal copies of the same window stay one confirmed slot", () => {
  assert.equal(relateTimeSlots(parseSetTimeSlot("7:00-7:35 PM"), parseSetTimeSlot("7:00-7:35 PM CDT")), "equal");
  assert.equal(confirmedSetTime(["7:00-7:35 PM", "7:00-7:35 PM CDT"]), "7:00-7:35 PM");
  const result = assessTbdAcousticSlot({
    songs: openingSet(),
    setTime: ["7:00-7:35 PM", "7:00-7:35 PM"],
  });
  assert.equal(result.scheduledMinutes, 35);
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
  const opening = DEFAULT_SONGS
    .filter((song) => song.setSlug === "jeff-story-friends")
    .slice()
    .sort((a, b) => a.position - b.position);
  assert.equal(opening[0]?.title, "The Drinking Song");
  assert.equal(opening[1]?.title, "Acoustic song - TBD");

  const result = assessTbdAcousticSlot({ songs: DEFAULT_SONGS, setTime: "7:00-7:35 PM" });
  assert.equal(result.slot.hasTbdSlot, true);
  assert.equal(result.slot.song?.title, "Acoustic song - TBD");
  assert.equal(result.decisionRequired, true);
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(
    result.candidates.map((c) => c.title).sort(),
    ["Badfish", "Nutshell"],
  );
});

test("reopening a non-designated seeded slot as TBD does not open the helper", () => {
  const reopenedElsewhere = DEFAULT_SONGS.map((song) => {
    if (song.setSlug !== "jeff-story-friends") return song;
    if (song.position === DESIGNATED_ACOUSTIC_SLOT_POSITION) {
      return { ...song, title: "Badfish" };
    }
    if (song.position === 4) {
      return { ...song, title: "Acoustic song - TBD" };
    }
    return song;
  });
  const result = assessTbdAcousticSlot({ songs: reopenedElsewhere, setTime: "7:00-7:35 PM" });
  assert.equal(result.slot.hasTbdSlot, false);
  assert.equal(result.slot.song, null);
  assert.equal(result.decisionRequired, false);
  assert.deepEqual(result.candidates, []);
});

test("reopening the seeded set's designated slot as TBD still finds it without guessing a fill", () => {
  const reopened = DEFAULT_SONGS.map((song) => (
    song.setSlug === "jeff-story-friends" && song.position === DESIGNATED_ACOUSTIC_SLOT_POSITION
      ? { ...song, title: "Acoustic song - TBD" }
      : song
  ));
  const result = assessTbdAcousticSlot({ songs: reopened, setTime: "7:00-7:35 PM" });
  assert.equal(result.slot.hasTbdSlot, true);
  assert.equal(result.slot.song.title, "Acoustic song - TBD");
  assert.equal(result.slot.song.position, DESIGNATED_ACOUSTIC_SLOT_POSITION);
  assert.equal(result.decisionRequired, true);
  assert.deepEqual(
    result.candidates.map((candidate) => candidate.title).sort(),
    ["Badfish", "Nutshell"],
  );
  assert.doesNotMatch(result.readinessChecklist.join(" "), /Badfish is chosen|Nutshell is chosen/);
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
  assert.match(control, /confirmedSetTime/);
  assert.match(control, /activeSet === "jeff-story-friends" \? \(\s*<AcousticSlotHelper/);
  assert.match(styles, /\.acousticHelperPanel/);
  assert.match(guide, /Acoustic slot helper/i);
  assert.match(guide, /never (auto-)?picks?|never chooses|does not choose/i);
  assert.match(guide, /designated second-acoustic position only/);
  assert.match(guide, /never by guessing a title or falling back/);
});

test("the acoustic helper module documents itself as read-only and non-guessing", async () => {
  const source = await readFile(helperUrl, "utf8");
  assert.match(source, /Never (writes|guesses)/i);
  assert.match(source, /never auto-selects/i);
  assert.doesNotMatch(source, /\?\? placeholders\[0\]/);
  assert.match(source, /second-acoustic position only/);
});
