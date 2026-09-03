"use client";

import { useEffect, useState } from "react";
import {
  practicePositionKey,
  resumeSongFromSavedPosition,
  type PracticeSongRef,
} from "../lib/show-night-use";
import styles from "./show-page.module.css";

export default function PracticeResume({
  showSlug,
  songs,
  practiceHref,
}: {
  showSlug: string;
  songs: PracticeSongRef[];
  practiceHref: string;
}) {
  const [resume, setResume] = useState<PracticeSongRef | null>(null);

  useEffect(() => {
    try {
      const savedId = localStorage.getItem(practicePositionKey(showSlug));
      setResume(resumeSongFromSavedPosition(savedId, songs));
    } catch {
      setResume(null);
    }
  }, [showSlug, songs]);

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
