import show from "../content/show.json";
import { PrintButton } from "./print-button";

const radDadColumns = [show.radDadSet.slice(0, 10), show.radDadSet.slice(10)];

export default function Home() {
  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="wordmark" href="#top" aria-label="Rad Dad and Friends, back to top">
          <span>RAD DAD</span>
          <b>+ FRIENDS</b>
        </a>
        <nav aria-label="Show page navigation">
          <a href="#timeline">Timeline</a>
          <a href="#guest-sets">Guest sets</a>
          <a href="#rad-dad">Rad Dad</a>
        </nav>
        <a className="packet-link" href="/Rad_Dad_Friends_Show_Packet_2026-09-19.pdf">
          PDF packet
        </a>
      </header>

      <main id="top">
        <section className="hero section-wrap" aria-labelledby="show-title">
          <div className="hero-copy">
            <p className="eyebrow"><span className="live-dot" />{show.site.eyebrow}</p>
            <h1 id="show-title">SHOW<br />NIGHT</h1>
            <p className="hero-deck">One live source for the schedule, guest cues, changeovers, and Rad Dad closing set.</p>

            <dl className="hero-facts">
              <div><dt>Date</dt><dd>{show.event.dateLong}</dd></div>
              <div><dt>Venue</dt><dd>{show.event.venue} · {show.event.city}</dd></div>
              <div><dt>Show</dt><dd>{show.event.showTime}</dd></div>
              <div><dt>Planned wrap</dt><dd>{show.event.plannedWrap}</dd></div>
            </dl>

            <div className="hero-actions">
              <a className="button button-primary" href="#timeline">View run of show</a>
              <a className="button button-secondary" href="/Rad_Dad_Friends_Show_Packet_2026-09-19.pdf">Download PDF</a>
              <PrintButton />
            </div>

            <div className="revision">
              <strong>{show.site.status}</strong>
              <span>Last updated {show.site.lastUpdated}</span>
            </div>
          </div>

          <figure className="poster-frame">
            <img src="/rad-dad-friends-flyer.png" alt="Rad Dad and Friends show flyer for September 19 at Guitars and Growlers" />
            <figcaption>{show.site.sourceNote}</figcaption>
          </figure>
        </section>

        <section className="marquee" aria-hidden="true">
          <span>RAD DAD + FRIENDS</span><i>◆</i><span>SEPTEMBER 19</span><i>◆</i><span>FREE SHOW</span><i>◆</i><span>7 - 10 PM</span>
        </section>

        <section className="content-section section-wrap" id="timeline">
          <div className="section-heading">
            <div><p className="kicker blue">/// Master timeline</p><h2>Keep the night moving.</h2></div>
            <p>Performance blocks are bold. Setup and changeover windows stay protected.</p>
          </div>

          <div className="timeline-board" role="table" aria-label="Master run of show">
            <div className="timeline-header" role="row">
              <span role="columnheader">Time</span><span role="columnheader">On stage / task</span><span role="columnheader">Window</span>
            </div>
            {show.schedule.map((item) => (
              <div className={`timeline-row ${item.kind} accent-${item.accent}`} role="row" key={`${item.time}-${item.task}`}>
                <time role="cell">{item.time}</time>
                <strong role="cell">{item.task}</strong>
                <span role="cell">{item.window}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="content-section section-wrap" id="guest-sets">
          <div className="section-heading">
            <div><p className="kicker pink">/// Guest sets</p><h2>Song order + featured players.</h2></div>
            <p>Know your entrance, ending, and handoff before the show begins.</p>
          </div>

          <div className="guest-grid">
            {show.guestSets.map((set) => (
              <article className={`set-card accent-${set.accent}`} key={set.name}>
                <header><div><span>SET</span><h3>{set.name}</h3></div><time>{set.time}</time></header>
                <ol>
                  {set.songs.map((song) => (
                    <li key={`${set.name}-${song.number}`}>
                      <span className="song-number">{String(song.number).padStart(2, "0")}</span>
                      <div><strong>{song.song}</strong>{song.cue && <small>{song.cue}</small>}</div>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        </section>

        <section className="content-section rad-section" id="rad-dad">
          <div className="section-wrap">
            <div className="rad-heading">
              <div><p className="kicker lime">/// Rad Dad closer</p><h2>9:00 - 10:00 PM</h2></div>
              <div className="flow-key"><span>→</span> continuous transition</div>
            </div>

            <div className="rad-columns">
              {radDadColumns.map((column, index) => (
                <ol className="rad-list" key={index} start={index === 0 ? 1 : 11}>
                  {column.map((song) => (
                    <li className={`${song.transition ? "transition" : ""} ${song.special ? "special" : ""}`} key={song.number}>
                      <span className="song-number">{String(song.number).padStart(2, "0")}</span>
                      <strong>{song.song}</strong>
                    </li>
                  ))}
                </ol>
              ))}
            </div>

            <div className="flex-block">
              <div><p className="kicker pink">/// Flex songs</p><span>Use only if running ahead</span></div>
              <ul>{show.flexSongs.map((song) => <li key={song}>{song}</li>)}</ul>
            </div>
          </div>
        </section>

        <section className="content-section section-wrap priorities" id="notes">
          <div className="section-heading">
            <div><p className="kicker lime">/// Show priorities</p><h2>Fast handoffs. Clean entries.</h2></div>
            <p>The planned 10:00 PM finish is the target for the night, not a venue curfew.</p>
          </div>
          <div className="priority-grid">
            {show.notes.map((note) => (
              <article className={`accent-${note.accent}`} key={note.label}>
                <span>{note.label}</span><p>{note.text}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer>
        <div className="section-wrap footer-inner">
          <div><strong>RAD DAD + FRIENDS</strong><span>{show.event.dateLong} · {show.event.venue}</span></div>
          <a href={show.event.website}>RADDADBAND.COM</a>
        </div>
      </footer>
    </div>
  );
}
