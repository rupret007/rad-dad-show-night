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
