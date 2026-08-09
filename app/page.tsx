import Image from "next/image";
import Link from "next/link";
import LiveSetLists, { SharePageButton } from "./live-set-lists";
import SongBoard from "./song-board";
import styles from "./show-page.module.css";
import { RUN_OF_SHOW, SHOW_DETAILS } from "../lib/show-data";
import { getOfficialSongs } from "../lib/show-store";

export const dynamic = "force-dynamic";

export default async function Home() {
  const songs = await getOfficialSongs();

  return (
    <main className={styles.page}>
      <div className={styles.atmosphere} aria-hidden="true" />

      <nav className={styles.topBar} aria-label="Show page navigation">
        <div className={styles.topBarInner}>
          <a className={styles.identity} href="#top" aria-label="Rad Dad show night home">
            <span className={styles.logoMark}>RD</span>
            <span>
              <strong>RAD DAD + FRIENDS</strong>
              <small>SHOW NIGHT HQ</small>
            </span>
          </a>
          <div className={styles.topLinks}>
            <a href="#run-of-show">Run of show</a>
            <a href="#official-sets">Set lists</a>
            <a href="#suggestions">Suggest a song</a>
            <Link className={styles.controlLink} href="/show-control">
              Edit official set
            </Link>
          </div>
        </div>
      </nav>

      <header className={styles.hero} id="top">
        <div className={styles.heroPosterWrap}>
          <div className={styles.posterFrame}>
            <span className={styles.posterTape} aria-hidden="true" />
            <Image
              className={styles.poster}
              src="/rad-dad-friends-flyer.png"
              alt="Rad Dad and Friends show flyer"
              width={900}
              height={1125}
              priority
            />
          </div>
        </div>

        <div className={styles.heroCopy}>
          <div className={styles.eyebrow}>
            <span className={styles.liveDot} /> Live show plan
          </div>
          <h1 className={styles.heroTitle}>
            RAD DAD <span className={styles.heroPlus}>+</span>
            <br />
            FRIENDS
          </h1>
          <p className={styles.heroDek}>
            One shared source of truth for every performer, every handoff, and
            every song on show night.
          </p>

          <div className={styles.eventGrid}>
            <div className={styles.eventFact}>
              <span className={styles.factLabel}>When</span>
              <strong className={styles.factValue}>{SHOW_DETAILS.date}</strong>
            </div>
            <div className={styles.eventFact}>
              <span className={styles.factLabel}>Time</span>
              <strong className={styles.factValue}>{SHOW_DETAILS.hours}</strong>
            </div>
            <div className={styles.eventFact}>
              <span className={styles.factLabel}>Where</span>
              <strong className={styles.factValue}>{SHOW_DETAILS.venue}</strong>
            </div>
          </div>

          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#run-of-show">
              See the running order
            </a>
            <SharePageButton />
          </div>
        </div>
      </header>

      <section className={styles.section} id="run-of-show">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>01 / Master timeline</p>
            <h2 className={styles.sectionTitle}>RUN OF SHOW</h2>
          </div>
          <p className={styles.sectionCopy}>
            Keep changeovers tight, protect the dedicated Fault Lines setup,
            and aim to land the night near 10:00 PM.
          </p>
        </div>

        <div className={styles.schedule}>
          {RUN_OF_SHOW.map((slot, index) => (
            <article
              className={`${styles.scheduleRow} ${
                slot.type === "changeover"
                  ? styles.changeoverRow
                  : styles.performanceRow
              }`}
              data-accent={slot.accent}
              key={`${slot.time}-${slot.title}`}
            >
              <div className={styles.timeBlock}>
                <strong className={styles.timeMain}>{slot.time}</strong>
                <span className={styles.duration}>{slot.duration}</span>
              </div>
              <span className={styles.scheduleIndex}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className={styles.scheduleBody}>
                <h3 className={styles.scheduleTitle}>{slot.title}</h3>
                <p className={styles.scheduleNote}>{slot.note}</p>
              </div>
              <span className={styles.scheduleAccent} aria-hidden="true" />
            </article>
          ))}
        </div>
      </section>

      <section className={styles.featureSet} aria-labelledby="fault-lines-title">
        <div className={styles.featureStripe} aria-hidden="true" />
        <div>
          <p className={styles.featureKicker}>Featured set / 7:45-8:25 PM</p>
          <h2 className={styles.featureTitle} id="fault-lines-title">
            MASON / THE FAULT LINES
          </h2>
        </div>
        <p className={styles.featureCopy}>
          Their 7:35-7:45 setup window is protected. Final song details stay
          with the band; the master timeline above is the stage cue.
        </p>
      </section>

      <section className={styles.section} id="official-sets">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>02 / Live source of truth</p>
            <h2 className={styles.sectionTitle}>OFFICIAL SETS</h2>
          </div>
          <p className={styles.sectionCopy}>
            These lists update from Show Control. Flow arrows are intentional
            transitions, and every song has a direct YouTube path.
          </p>
        </div>
        <LiveSetLists initialSongs={songs} />
      </section>

      <section className={styles.section} aria-labelledby="notes-title">
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>03 / Keep it moving</p>
            <h2 className={styles.sectionTitle} id="notes-title">
              PRODUCTION NOTES
            </h2>
          </div>
        </div>
        <div className={styles.notesGrid}>
          {[
            "Share the backline where practical.",
            "Protect the Mason / Fault Lines setup window.",
            "Confirm guest keys and endings before show day.",
            "10:00 PM is the expected wrap, not a venue curfew.",
          ].map((note, index) => (
            <div className={styles.noteCard} key={note}>
              <span className={styles.noteNumber}>0{index + 1}</span>
              <p className={styles.noteText}>{note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className={`${styles.section} ${styles.suggestionsSection}`} id="suggestions">
        <SongBoard />
      </section>

      <footer className={styles.footer}>
        <div>
          <strong className={styles.footerBrand}>RAD DAD + FRIENDS</strong>
          <p className={styles.footerMeta}>
            {SHOW_DETAILS.date} / {SHOW_DETAILS.venue}
          </p>
        </div>
        <Link className={styles.footerControl} href="/show-control">
          Jeff: open Show Control
        </Link>
      </footer>
    </main>
  );
}
