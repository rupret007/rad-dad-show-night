export type ShowLifecycleStatus = "draft" | "published" | "archived";

export type ShowStatusChange = {
  currentStatus: ShowLifecycleStatus;
  targetStatus: ShowLifecycleStatus;
  isDefault: boolean;
  dirtySetCount?: number;
};

/**
 * Keeps show lifecycle changes honest on both sides of the owner boundary.
 * The browser supplies dirtySetCount; the API repeats the default-show guard.
 */
export function showStatusChangeBlockReason({
  currentStatus,
  targetStatus,
  isDefault,
  dirtySetCount = 0,
}: ShowStatusChange): string | null {
  if (currentStatus === targetStatus) return null;

  const changedSets =
    Number.isInteger(dirtySetCount) && dirtySetCount > 0 ? dirtySetCount : 0;
  if (changedSets) {
    return `Save or discard ${changedSets} changed set${changedSets === 1 ? "" : "s"} before changing this show's status.`;
  }

  if (isDefault && targetStatus !== "published") {
    return "The default public show cannot be archived because the main show link would stop working. Keep it published until a replacement-default workflow exists.";
  }

  return null;
}

export function showStatusChangeConfirmation(
  showTitle: string,
  targetStatus: ShowLifecycleStatus,
): string {
  const title = showTitle.trim() || "this show";
  if (targetStatus === "published") {
    return `Publish “${title}”? Its saved show details and set lists will become available at the public share link.`;
  }
  if (targetStatus === "archived") {
    return `Archive “${title}”? Its public share link will stop working until the show is published again.`;
  }
  return `Move “${title}” back to draft? Its public share link will stop working.`;
}

export function isPublicShareOpen(status: ShowLifecycleStatus): boolean {
  return status === "published";
}

export function showStatusBadge(status: ShowLifecycleStatus, isDefault = false): string {
  const role = isDefault ? " · default" : "";
  if (status === "published") return `Published · public${role}`;
  if (status === "archived") return `Archived · closed${role}`;
  return `Draft · not public${role}`;
}

export function showShareLinkLabel(status: ShowLifecycleStatus): string {
  return isPublicShareOpen(status) ? "Open public share link" : "See closed public link";
}

export function showOwnerLifecycleHint({
  currentStatus,
  isDefault,
  dirtySetCount = 0,
}: {
  currentStatus: ShowLifecycleStatus;
  isDefault: boolean;
  dirtySetCount?: number;
}): string {
  const publishBlock = showStatusChangeBlockReason({
    currentStatus,
    targetStatus: "published",
    isDefault,
    dirtySetCount,
  });
  const archiveBlock = showStatusChangeBlockReason({
    currentStatus,
    targetStatus: "archived",
    isDefault,
    dirtySetCount,
  });
  if (dirtySetCount) return archiveBlock ?? publishBlock ?? "";
  if (isDefault && archiveBlock) return archiveBlock;
  if (currentStatus === "published") {
    return "This public share link is open. Saving a set updates it. Archive closes it.";
  }
  if (currentStatus === "archived") {
    return "This show is archived. The public share link is closed. Publish to open it again.";
  }
  return "This draft is private. Saving a set does not open the public share link. Publish when the saved show should be public.";
}

export function showEditorLiveState({
  status,
  setDirty,
}: {
  status: ShowLifecycleStatus;
  setDirty: boolean;
}): string {
  if (status === "published") {
    return setDirty ? "Unsaved — not on the public page yet" : "Matches public page";
  }
  if (status === "archived") {
    return setDirty ? "Unsaved archived show" : "Archived — public link closed";
  }
  return setDirty ? "Unsaved private draft" : "Private draft — not public";
}

export function showOwnerDirtyNotice(status: ShowLifecycleStatus): string {
  if (status === "published") {
    return "Unsaved changes. Save this set to update the public share link.";
  }
  return "Unsaved changes. Saving updates this private show. It stays off the public share link until you publish.";
}

export function showOwnerReadyNotice(status: ShowLifecycleStatus): string {
  if (status === "published") {
    return "Ready. This published set matches the public share link.";
  }
  if (status === "archived") {
    return "Ready. This show is archived. The public share link is closed.";
  }
  return "Ready. This draft is private. The public share link is closed.";
}

export function showOwnerSavingNotice(
  setTitle: string,
  status: ShowLifecycleStatus,
): string {
  const title = setTitle.trim() || "this set";
  if (status === "published") {
    return `Saving ${title} to the public share link...`;
  }
  return `Saving ${title} on this private show...`;
}

export function showOwnerSaveHoldNotice(
  kind: "uncertain" | "conflict",
  setTitle: string,
): string {
  const title = setTitle.trim() || "this set";
  if (kind === "conflict") {
    return `${title} changed since you last loaded it. Check the saved list before writing this browser draft over it.`;
  }
  return `The last ${title} save did not come back with a verified official list. Check that saved list before saving again. The earlier write may have landed.`;
}

export function showOwnerSavedWithLaterEditsNotice(
  setTitle: string,
  status: ShowLifecycleStatus,
): string {
  const title = setTitle.trim() || "this set";
  if (status === "published") {
    return `${title} saved the list you sent. Later edits on this set are still unsaved and not on the public share link yet.`;
  }
  return `${title} saved the list you sent. Later edits on this set are still unsaved on this private show.`;
}

export function showOwnerCheckedKeptDraftNotice(setTitle: string): string {
  const title = setTitle.trim() || "this set";
  return `The saved ${title} list is loaded. Your unsaved draft is still here. Saving now writes this draft.`;
}

export function showOwnerSavedNotice(
  setTitle: string,
  status: ShowLifecycleStatus,
): string {
  const title = setTitle.trim() || "this set";
  if (status === "published") {
    return `${title} is live on the public share link.`;
  }
  if (status === "archived") {
    return `${title} is saved. The public share link stays closed until this show is published again.`;
  }
  return `${title} is saved on this private draft. The public share link stays closed until you publish.`;
}

export function publishedPublicShareCopy(hasVerifiedList: boolean): string {
  return hasVerifiedList
    ? "This public share link is live."
    : "This public share link is live, and this night has no official set yet.";
}

export function unpublishedPublicCopy(): {
  badge: string;
  title: string;
  body: string;
} {
  return {
    badge: "Share link closed",
    title: "NO PUBLISHED SHOW AT THIS LINK.",
    body: "No published show was found at this link. Draft and archived nights stay in Show Control. Another event's set will not open here.",
  };
}
