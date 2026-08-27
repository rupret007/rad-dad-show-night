import LiveSetLists, { SharePageButton } from "./live-set-lists";
import ShowFlyer from "./show-flyer";
import SongBoard from "./song-board";
import styles from "./show-page.module.css";
import { SET_DEFINITIONS } from "../lib/show-data";
import { SHOW_FLYER_CANDIDATES } from "../lib/show-media";
import { getShowPayload } from "../lib/show-store";
import { PUBLIC_SITE_LABEL, PUBLIC_SITE_URL } from "../lib/surface-roles";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams?:
    | Promise<{ show?: string; practice?: string }>
    | { show?: string; practice?: string };
}) {
  const params = await Promise.resolve(searchParams ?? {});
  const { songs, show, timeline } = await getShowPayload(params.show);
  const practiceMode = params.practice === "1" || params.practice === "true";
  const controlHref = `/show-control?show=${encodeURIComponent(show.slug)}`;
  const showHref = `/?show=${encodeURIComponent(show.slug)}`;
  const practiceHref = `${showHref}&practice=1#official-sets`;

  return (
    <main
      className={`${styles.page} ${practiceMode ? styles.practicePage : ""}`}
      data-show-slug={show.slug}
    >
      <div className={styles.atmosphere} aria-hidden="true" />

      <nav className={styles.topBar} aria-label="Show page navigation">
        <div className={styles.topBarInner}>
          <a
            className={styles.identity}
            href={practiceMode ? showHref : "#top"}
            aria-label="Rad Dad show night"
          >
            <span className={styles.logoMark}>RD</span>
            <span>
              <strong>RAD DAD + FRIENDS</strong>
              <small>SHOW NIGHT</small>
            </span>
          </a>
          <div className={styles.topLinks}>
            {practiceMode ? (
              <>
                <a href="#official-sets">Set lists</a>
                <a className={styles.practiceLink} href={showHref}>
                  Exit practice mode
                </a>
              </>
            ) : (
              <>
                <a href="#run-of-show">Run of show</a>
                <a href="#official-sets">Set lists</a>
                <a href="#suggestions">Suggest a song</a>
                <a className={styles.practiceLink} href={practiceHref}>
                  Practice mode
                </a>
                <a className={styles.controlLink} href={controlHref}>
                  Owner: edit set
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      {practiceMode ? (
        <header className={styles.practiceHero} id="top">
          <div>
            <p className={styles.practiceEyebrow}>Rehearsal reference / live list</p>
            <h1 className={styles.practiceTitle}>PRACTICE MODE</h1>
            <p className={styles.practiceDek}>
              Tap a song to mark your place. Saved lyrics and YouTube open in a
              new tab when a song has them.
            </p>
          </div>
          <div className={styles.practiceShowMeta}>
            <strong>{show.title}</strong>
            <span>{show.date}</span>
            <span>{show.venue}</span>
          </div>
        </header>
      ) : (
      <header className={styles.hero} id="top">
        <ShowFlyer alt="Rad Dad and Friends at Guitars and Growlers on Saturday, September 19, 2026, from 7 to 10 PM" />

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
            The live set surface for this night: official order, handoffs, and
            keys. Covers can show YouTube and lyrics when saved; originals hide
            both. The public band site stays on raddadband.com.
          </p>

          <div className={styles.eventGrid}>
            <div className={styles.eventFact}>
              <span className={styles.factLabel}>When</span>
              <strong className={styles.factValue}>{show.date}</strong>
            </div>
            <div className={styles.eventFact}>
              <span className={styles.factLabel}>Time</span>
              <strong className={styles.factValue}>{show.hours}</strong>
            </div>
            <div className={styles.eventFact}>
              <span className={styles.factLabel}>Where</span>
              <strong className={styles.factValue}>{show.venue}</strong>
            </div>
          </div>

          <div
            className={`${styles.eventGrid} ${styles.officialSetGrid}`}
            aria-label="Official sets"
          >
            {SET_DEFINITIONS.map((set) => (
              <div className={styles.eventFact} key={set.slug}>
                <span className={styles.factLabel}>{set.time}</span>
                <strong className={styles.factValue}>{set.title}</strong>
              </div>
            ))}
          </div>

          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="#official-sets">
              See the official sets
            </a>
            <a className={styles.secondaryAction} href="#run-of-show">
              See the running order
            </a>
            <a
              className={styles.secondaryAction}
              href={SHOW_FLYER_CANDIDATES[0]}
              target="_blank"
              rel="noreferrer"
            >
              View full flyer
            </a>
            <SharePageButton />
          </div>
        </div>
      </header>
      )}

      {!practiceMode ? (
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
          {timeline.map((slot, index) => (
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
      ) : null}

      {!practiceMode ? (
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
      ) : null}

      <section
        className={`${styles.section} ${practiceMode ? styles.practiceSection : ""}`}
        id="official-sets"
      >
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.sectionKicker}>
              {practiceMode ? "Live rehearsal reference" : "02 / Live set surface"}
            </p>
            <h2 className={styles.sectionTitle}>OFFICIAL SETS</h2>
          </div>
          <p className={styles.sectionCopy}>
            {practiceMode
              ? "This is the official live order. Tap any song to mark it current. Saved lyrics and YouTube stay on that song when they exist."
              : "These lists update from Show Control. Flow arrows are intentional transitions. Covers can show YouTube and lyrics when saved; originals hide both."}
          </p>
        </div>
        <LiveSetLists
          initialSongs={songs}
          showSlug={show.slug}
          practiceMode={practiceMode}
        />
      </section>

      {!practiceMode ? (
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
      ) : null}

      {!practiceMode ? (
      <section className={`${styles.section} ${styles.suggestionsSection}`} id="suggestions">
        <SongBoard />
      </section>
      ) : null}

      <footer className={styles.footer}>
        <div>
          <strong className={styles.footerBrand}>RAD DAD + FRIENDS</strong>
          <p className={styles.footerMeta}>
            {show.date} / {show.venue}
          </p>
          <p className={styles.footerSurfaces}>
            Live set surface
            {" · "}
            <a href={PUBLIC_SITE_URL} target="_blank" rel="noreferrer">
              {PUBLIC_SITE_LABEL}
            </a>
          </p>
        </div>
        <a className={styles.footerControl} href={practiceMode ? showHref : controlHref}>
          {practiceMode ? "Return to full show page" : "Owner: open Show Control"}
        </a>
      </footer>
    </main>
  );
}
