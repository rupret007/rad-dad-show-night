"use client";

import { useMemo } from "react";
import { assessTbdAcousticSlot } from "../../lib/acoustic-set-helper";
import type { ShowSong } from "../../lib/show-data";
import styles from "./show-control.module.css";

export default function AcousticSlotHelper({
  songs,
  setTime,
}: {
  songs: ShowSong[];
  setTime: string;
}) {
  // Recomputed straight from the browser draft; this panel never saves or picks for the owner.
  const result = useMemo(
    () => assessTbdAcousticSlot({ songs, setTime }),
    [songs, setTime],
  );

  if (!result.slot.hasTbdSlot) return null;

  return (
    <section className={styles.acousticHelperPanel} aria-label="Acoustic slot helper" data-decision-required="true">
      <div>
        <span>ACOUSTIC SLOT HELPER</span>
        <strong>Slot {result.slot.song?.position} is still TBD</strong>
        <p>
          {result.scheduledMinutes === null
            ? "This set has no confirmed start-to-end window yet, so runtime fit below is unscored."
            : `${result.scheduledMinutes} minute window · about ${Math.max(0, Math.round((result.remainingSeconds ?? 0) / 60))} minutes left once the confirmed songs are counted.`}
        </p>
      </div>

      {result.candidates.length ? (
        <ul className={styles.acousticCandidateList}>
          {result.candidates.map((candidate) => (
            <li key={candidate.id} data-fit={candidate.fit}>
              <div>
                <strong>{candidate.title}</strong>
                {candidate.artist ? <span> — {candidate.artist}</span> : null}
              </div>
              <p>{candidate.detail}</p>
              {candidate.note ? <p className={styles.acousticCandidateNote}>{candidate.note}</p> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.acousticNoCandidates}>No candidate songs recorded yet.</p>
      )}

      <ol className={styles.acousticChecklist} aria-label="Steps to resolve this TBD slot">
        {result.readinessChecklist.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ol>
    </section>
  );
}
