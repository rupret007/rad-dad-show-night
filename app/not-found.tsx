import Link from "next/link";
import { unpublishedPublicCopy } from "../lib/show-lifecycle";
import styles from "./show-page.module.css";

export default function NotFound() {
  const copy = unpublishedPublicCopy();
  return (
    <main
      className={`${styles.page} ${styles.unavailablePage}`}
      data-public-share="closed"
    >
      <section className={styles.unavailableCard} role="status">
        <span className={styles.unavailableBadge}>{copy.badge}</span>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <div className={styles.unavailableActions}>
          <Link href="/">Open the default public show</Link>
          <Link href="/show-control">Owner: Show Control</Link>
        </div>
      </section>
    </main>
  );
}
