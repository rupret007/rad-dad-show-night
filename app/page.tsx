import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import LiveSetLists, { SharePageButton } from "./live-set-lists";
import ShowFlyer from "./show-flyer";
import SongBoard from "./song-board";
import styles from "./show-page.module.css";
import { SHOW_FLYER_CANDIDATES } from "../lib/show-media";
import { getShowPayload } from "../lib/show-store";
import {
  CONFIRMED_FALLBACK_SHOW_SLUG,
  featuredGuestSet,
  isCanonicalShowSlug,
  isShowDataUnavailableError,
} from "../lib/show-read-integrity";
import { isShowNotFoundError } from "../lib/show-visibility";
import { PUBLIC_SITE_LABEL, PUBLIC_SITE_URL } from "../lib/surface-roles";

export const dynamic = "force-dynamic";

const CANONICAL_TITLE =
  "Rad Dad and Friends at Guitars & Growlers | September 19, 2026";
const CANONICAL_DESCRIPTION =
  "Free live show at Guitars & Growlers in Richardson on Saturday, September 19, 2026, from 7-10 PM.";

function canonicalMetadata(): Metadata {
  return {
    title: CANONICAL_TITLE,
    description: CANONICAL_DESCRIPTION,
    openGraph: {
      title: CANONICAL_TITLE,
      description: CANONICAL_DESCRIPTION,
      type: "website",
      images: [
        {
          url: "/og.png",
          width: 1200,
          height: 630,
          alt: "Rad Dad and Friends at Guitars & Growlers on September 19, 2026",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: CANONICAL_TITLE,
      description: CANONICAL_DESCRIPTION,
      images: ["/og.png"],
    },
  };
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams?:
    | Promise<{ show?: string; practice?: string }>
    | { show?: string; practice?: string };
}): Promise<Metadata> {
  const params = await Promise.resolve(searchParams ?? {});
  try {
    const payload = await getShowPayload(params.show, "public");
    if (isCanonicalShowSlug(payload.show.slug)) {
      return canonicalMetadata();
    }
    const title = `${payload.show.title} at ${payload.show.venue} | ${payload.show.date}`;
    const description = `Live set surface for ${payload.show.title} at ${payload.show.venue} on ${payload.show.date}, ${payload.show.hours}.`;
    return {
      title,
      description,
      openGraph: { title, description, type: "website" },
      twitter: { title, description },
    };
  } catch {
    if (!params.show || params.show === CONFIRMED_FALLBACK_SHOW_SLUG) {
      return canonicalMetadata();
    }
    return {
      title: "Rad Dad + Friends Show Night",
      description: "Live set surface for Rad Dad + Friends.",
    };
  }
}

export default async function Home({
  searchParams,
}: {
  searchParams?:
    | Promise<{ show?: string; practice?: string }>
    | { show?: string; practice?: string };
}) {
  const params = await Promise.resolve(searchParams ?? {});
  let payload;
  try {
    payload = await getShowPayload(params.show, "public");
  } catch (error) {
    if (isShowNotFoundError(error)) notFound();
    if (isShowDataUnavailableError(error)) {
      return <ShowUnavailable showSlug={params.show} />;
    }
    throw error;
  }
  const { dataSource, songs, show, timeline, sets } = payload;
  const practiceMode = params.practice === "1" || params.practice === "true";
  const canonicalShow = isCanonicalShowSlug(show.slug);
  const featuredGuest = featuredGuestSet(timeline);
  const controlHref = `/show-control?show=${encodeURIComponent(show.slug)}`;
  const showHref = `/?show=${encodeURIComponent(show.slug)}`;
  const practiceHref = `${showHref}&practice=1#official-sets`;

  return (
    <main
      className={`${styles.page} ${practiceMode ? styles.practicePage : ""}`}
      data-show-slug={show.slug}
      data-show-source={dataSource}
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
        {canonicalShow ? (
          <ShowFlyer alt="Rad Dad and Friends at Guitars and Growlers on Saturday, September 19, 2026, from 7 to 10 PM" />
        ) : (
          <div className={styles.heroPosterWrap}>
            <div className={styles.posterFrame}>
              <span className={styles.posterTape} aria-hidden="true" />
              <div className={styles.showIdentityCard}>
                <span>{show.date}</span>
                <strong>{show.title}</strong>
                <span>{show.venue}</span>
                <small>{show.hours}</small>
              </div>
            </div>
          </div>
        )}

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

          <section
            className={styles.nextActions}
            aria-label="Next step for this show"
          >
            <article className={styles.nextAction} data-role="fan">
              <p className={styles.nextKicker}>Fan next step</p>
              <h2>See this night, then suggest a song.</h2>
              <p>
                This page is the live set for this show, not the band homepage.
              </p>
              <div className={styles.nextActionLinks}>
                <a className={styles.primaryAction} href="#official-sets">
                  See the official sets
                </a>
                <a className={styles.secondaryAction} href="#suggestions">
                  Suggest a song
                </a>
              </div>
            </article>
            <article className={styles.nextAction} data-role="band">
              <p className={styles.nextKicker}>Band next step</p>
              <h2>Practice this show&apos;s verified list.</h2>
              <p>
                Keys, handoffs, and your place stay on this event. Another
                show&apos;s set cannot appear here.
              </p>
              <div className={styles.nextActionLinks}>
                <a className={styles.primaryAction} href={practiceHref}>
                  Practice this show
                </a>
              </div>
            </article>
          </section>

          <div
            className={`${styles.eventGrid} ${styles.officialSetGrid}`}
            aria-label="Official sets"
          >
            {sets.map((set) => (
              <div className={styles.eventFact} key={set.slug}>
                <span className={styles.factLabel}>{set.time || "This show"}</span>
                <strong className={styles.factValue}>{set.title}</strong>
              </div>
            ))}
          </div>

          <div className={styles.heroActions}>
            <a className={styles.secondaryAction} href="#run-of-show">
              See the running order
            </a>
            {canonicalShow ? (
              <a
                className={styles.secondaryAction}
                href={SHOW_FLYER_CANDIDATES[0]}
                target="_blank"
                rel="noreferrer"
              >
                View full flyer
              </a>
            ) : null}
            <SharePageButton
              title={`${show.title} Show Night`}
              text={`Run of show and live set lists for ${show.date} at ${show.venue}.`}
            />
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
            {canonicalShow
              ? "Keep changeovers tight, protect the dedicated Fault Lines setup, and aim to land the night near 10:00 PM."
              : `Keep changeovers tight and aim for ${show.expectedWrap || show.hours}.`}
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

      {!practiceMode && featuredGuest ? (
      <section className={styles.featureSet} aria-labelledby="fault-lines-title">
        <div className={styles.featureStripe} aria-hidden="true" />
        <div>
          <p className={styles.featureKicker}>
            Featured set / {featuredGuest.performance.time}
            {/\b(AM|PM)\b/i.test(featuredGuest.performance.time) ? "" : " PM"}
          </p>
          <h2 className={styles.featureTitle} id="fault-lines-title">
            {featuredGuest.performance.title.toUpperCase()}
          </h2>
        </div>
        <p className={styles.featureCopy}>
          {featuredGuest.setup
            ? `Their ${featuredGuest.setup.time} setup window is protected. Final song details stay with the band; the master timeline above is the stage cue.`
            : "Final song details stay with the band; the master timeline above is the stage cue."}
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
          initialSets={sets}
          initialDataSource={dataSource}
          showSlug={show.slug}
          showId={show.id}
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
            canonicalShow
              ? "10:00 PM is the expected wrap, not a venue curfew."
              : `${show.expectedWrap || show.hours} is the expected wrap, not a venue curfew.`,
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

function ShowUnavailable({ showSlug }: { showSlug?: string }) {
  const retryHref = showSlug
    ? `/?show=${encodeURIComponent(showSlug)}`
    : "/";
  return (
    <main className={`${styles.page} ${styles.unavailablePage}`}>
      <section className={styles.unavailableCard} role="alert">
        <span className={styles.unavailableBadge}>Live data paused</span>
        <h1>THIS SHOW IS TEMPORARILY UNAVAILABLE.</h1>
        <p>
          We could not verify this show&apos;s own set data, so we did not
          substitute another event&apos;s songs. Try again when the live show
          database reconnects.
        </p>
        <div className={styles.unavailableActions}>
          <Link href={retryHref}>Try this show again</Link>
          <Link href="/">Open the default show</Link>
        </div>
      </section>
    </main>
  );
}
