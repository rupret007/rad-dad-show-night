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

export function showLifecycleHint({
  currentStatus,
  isDefault,
  dirtySetCount = 0,
}: Omit<ShowStatusChange, "targetStatus">): string {
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

  if (dirtySetCount) {
    return (
      archiveBlock ??
      publishBlock ??
      "Save or discard changed sets before changing this show's status."
    );
  }
  if (isDefault) {
    return (
      archiveBlock ??
      "The default public show stays published so the main show link keeps working."
    );
  }
  if (currentStatus === "published") {
    return "This public share link is open. Archiving closes it.";
  }
  if (currentStatus === "archived") {
    return "This public share link is closed. Publishing opens the saved show again.";
  }
  return "This draft is owner-only. Publishing opens the saved share link.";
}

export function showPublicShareLinkLabel(
  status: ShowLifecycleStatus,
  surface: "header" | "actions" = "actions",
): string {
  if (status === "published") {
    return surface === "header" ? "Open public show" : "Open public share link";
  }
  return surface === "header" ? "Public link closed" : "Public share link is closed";
}

export function showPublicShareLinkOpen(status: ShowLifecycleStatus): boolean {
  return status === "published";
}

export function savingSetNotice(setTitle: string): string {
  return `Saving ${setTitle.trim() || "this set"}...`;
}

export function savedSetNotice(
  setTitle: string,
  status: ShowLifecycleStatus,
): string {
  const title = setTitle.trim() || "This set";
  if (status === "published") {
    return `${title} is live on the public show page.`;
  }
  if (status === "archived") {
    return `${title} is saved. This show's public share link stays closed until you publish.`;
  }
  return `${title} is saved on this private draft. Publish the show to open its public share link.`;
}

export function savedSetStateLabel(
  status: ShowLifecycleStatus,
  dirty: boolean,
): string {
  if (dirty) return "Draft changes";
  if (status === "published") return "Matches public page";
  if (status === "archived") return "Saved, public link closed";
  return "Saved private draft";
}
