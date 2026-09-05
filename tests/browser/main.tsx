import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import SongBoard from "../../app/song-board";
import ShowControlClient from "../../app/show-control/show-control";

// This entry is served only by the standalone test Vite config. It imports the
// real components, not application routes, authentication, Workers, or D1.
const ownerSurface = new URLSearchParams(window.location.search).get("surface") === "owner";
const root = document.getElementById("root");
if (!root) throw new Error("The offline browser fixture root is missing.");

const content = (
  ownerSurface ? (
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
