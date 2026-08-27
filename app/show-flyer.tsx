"use client";

import { useState } from "react";
import { SHOW_FLYER_CANDIDATES } from "../lib/show-media";
import styles from "./show-page.module.css";

export default function ShowFlyer({ alt }: { alt: string }) {
  const [index, setIndex] = useState(0);
  const src = SHOW_FLYER_CANDIDATES[index];
  if (!src) return null;

  return (
    <div className={styles.heroPosterWrap}>
      <div className={styles.posterFrame}>
        <span className={styles.posterTape} aria-hidden="true" />
        <img
          className={styles.poster}
          src={src}
          alt={alt}
          width={1024}
          height={1536}
          onError={() => setIndex((current) => current + 1)}
        />
      </div>
    </div>
  );
}
