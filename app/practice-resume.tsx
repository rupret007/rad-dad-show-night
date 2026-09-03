"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  practicePositionKey,
  resumeSongFromSavedPosition,
  type PracticeSongRef,
} from "../lib/show-night-use";
import styles from "./show-page.module.css";

function readResume(
  showSlug: string,
  songs: PracticeSongRef[],
): PracticeSongRef | null {
  try {
    return resumeSongFromSavedPosition(
      localStorage.getItem(practicePositionKey(showSlug)),
      songs,
    );
  } catch {
    return null;
  }
}

export default function PracticeResume({
  showSlug,
  songs,
  practiceHref,
}: {
  showSlug: string;
  songs: PracticeSongRef[];
  practiceHref: string;
}) {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const onStorage = (event: StorageEvent) => {
        if (event.key === practicePositionKey(showSlug)) onStoreChange();
      };
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    },
    [showSlug],
  );
  const getSnapshot = useCallback(
    () => readResume(showSlug, songs),
    [showSlug, songs],
  );
  const resume = useSyncExternalStore(subscribe, getSnapshot, () => null);

  if (!resume) return null;

  const resumeHref = practiceHref.includes("#")
    ? practiceHref.replace(/#.*$/, `#practice-song-${resume.id}`)
    : `${practiceHref}#practice-song-${resume.id}`;

  return (
    <a className={styles.secondaryAction} href={resumeHref}>
      Continue from {resume.title}
    </a>
  );
}
