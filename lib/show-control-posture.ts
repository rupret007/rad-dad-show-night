import type { SetSlug } from "./show-data";
import type { ShowLifecycleStatus } from "./show-lifecycle";

export type ShowControlSetPosture = {
  slug: SetSlug;
  title: string;
  time: string;
  songCount: number;
};

export type ShowControlNextAction = {
  kind: "save-set" | "add-song" | "publish-show" | "run-show" | "none";
  title: string;
  detail: string;
  label: string;
  setSlug?: SetSlug;
};

type PostureItem = {
  label: string;
  value: string;
  detail: string;
};

export type ShowControlPosture = {
  publicLink: PostureItem;
  setPlan: PostureItem;
  booking: PostureItem;
  nextAction: ShowControlNextAction;
};

function safeSongCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function publicLinkPosture(
  status: ShowLifecycleStatus,
  dirtySetCount: number,
): PostureItem {
  if (status === "published") {
    return {
      label: "Public share link",
      value: dirtySetCount ? "Open · last saved list" : "Open · saved list",
      detail: dirtySetCount
        ? `${dirtySetCount} changed set${dirtySetCount === 1 ? " is" : "s are"} still private in this browser.`
        : "The public link matches every saved set.",
    };
  }
  if (status === "archived") {
    return {
      label: "Public share link",
      value: "Closed · archived",
      detail: "Saved sets stay private until the owner publishes this show again.",
    };
  }
  return {
    label: "Public share link",
    value: "Closed · private draft",
    detail: "Saving sets does not open the link. Publish is a separate owner action.",
  };
}

export function buildShowControlPosture({
  status,
  sets,
  dirtySetSlugs,
}: {
  status: ShowLifecycleStatus;
  sets: ShowControlSetPosture[];
  dirtySetSlugs: SetSlug[];
}): ShowControlPosture {
  const dirty = new Set(dirtySetSlugs);
  const firstDirtySet = sets.find((set) => dirty.has(set.slug));
  const totalSongs = sets.reduce(
    (total, set) => total + safeSongCount(set.songCount),
    0,
  );
  const populatedSets = sets.filter((set) => safeSongCount(set.songCount) > 0).length;
  const scheduledSets = sets.filter((set) => set.time.trim()).length;

  let nextAction: ShowControlNextAction;
  if (firstDirtySet) {
    nextAction = {
      kind: "save-set",
      title: `Finish ${firstDirtySet.title} first.`,
      detail: `${firstDirtySet.title} has unsaved changes. Save it before changing the show lifecycle or opening run mode.`,
      label: `Save ${firstDirtySet.title}`,
      setSlug: firstDirtySet.slug,
    };
  } else if (!sets.length) {
    nextAction = {
      kind: "none",
      title: "Verify this show's set plan.",
      detail: "No verified set definitions loaded, so Show Control will not guess a next action.",
      label: "No safe action",
    };
  } else if (!totalSongs) {
    nextAction = {
      kind: "add-song",
      title: `Start ${sets[0].title}.`,
      detail: "This show has no verified songs. Add the first song here instead of borrowing another night's list.",
      label: "Add the first song",
      setSlug: sets[0].slug,
    };
  } else if (status !== "published") {
    nextAction = {
      kind: "publish-show",
      title: "Open the saved show link.",
      detail: `${totalSongs} saved song${totalSongs === 1 ? " is" : "s are"} still private. Publish only after the saved sets are ready to share.`,
      label: "Publish saved show",
    };
  } else {
    nextAction = {
      kind: "run-show",
      title: "Run the verified show list.",
      detail: `${totalSongs} saved song${totalSongs === 1 ? " is" : "s are"} public. Open the phone-friendly band run mode.`,
      label: "Open band run mode",
    };
  }

  return {
    publicLink: publicLinkPosture(status, dirty.size),
    setPlan: {
      label: "Official set plan",
      value: totalSongs
        ? `${totalSongs} song${totalSongs === 1 ? "" : "s"} · ${populatedSets} active set${populatedSets === 1 ? "" : "s"}`
        : "No verified songs",
      detail: scheduledSets
        ? `${scheduledSets} set window${scheduledSets === 1 ? " is" : "s are"} scheduled for this show.`
        : "No songs or set times will be borrowed from another night.",
    },
    booking: {
      label: "Booking & outreach",
      value: "Travis owns booking",
      detail: "Show Control never pitches, posts, or sends outreach.",
    },
    nextAction,
  };
}
