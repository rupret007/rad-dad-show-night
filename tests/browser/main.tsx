import { createRoot } from "react-dom/client";
import { StrictMode, useState } from "react";
import SongBoard from "../../app/song-board";
import ShowControlClient from "../../app/show-control/show-control";
import LiveSetLists from "../../app/live-set-lists";
import pageStyles from "../../app/show-page.module.css";
import { RUN_SETS, RUN_SHOW_ID, RUN_SHOW_SLUG, RUN_SONGS } from "./run-fixture-data";

// This entry is served only by the standalone test Vite config. It imports the
// real components, not application routes, authentication, Workers, or D1.
const ownerSurface = new URLSearchParams(window.location.search).get("surface") === "owner";
const runSurface = new URLSearchParams(window.location.search).get("surface") === "run";
const root = document.getElementById("root");
if (!root) throw new Error("The offline browser fixture root is missing.");

function RunFixtureSurface() {
  const [otherShow, setOtherShow] = useState(false);
  const showId = otherShow ? "other-run-fixture-show" : RUN_SHOW_ID;
  return (
    <div className={`${pageStyles.page} ${pageStyles.practicePage}`}>
    <main className="audience-fixture">
      <h1>Offline band run fixture</h1>
      <button type="button" onClick={() => setOtherShow((current) => !current)}>Switch fixture show</button>
      <LiveSetLists
        initialSongs={otherShow ? RUN_SONGS.map((song) => ({ ...song, showId, title: `Other ${song.title}` })) : RUN_SONGS}
        initialSets={RUN_SETS}
        initialDataSource={new URLSearchParams(window.location.search).get("source") === "fallback" ? "confirmed-fallback" : "database"}
        showSlug={otherShow ? "other-run-fixture-night" : RUN_SHOW_SLUG}
        showId={showId}
        practiceMode
      />
    </main>
    </div>
  );
}

const content = (
  runSurface ? (
    <RunFixtureSurface />
  ) : ownerSurface ? (
    <ShowControlClient
      userName="Offline test owner"
      userEmail="owner@example.test"
      signOutHref="/#test-sign-out"
    />
  ) : (
    <main className="audience-fixture">
      <SongBoard />
    </main>
  )
);
createRoot(root).render(
  new URLSearchParams(window.location.search).has("strict")
    ? <StrictMode>{content}</StrictMode>
    : content,
);
