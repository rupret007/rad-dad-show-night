import type { ManagedShow } from "./show-data";

export const OWNER_STATUS_DEADLINE_MS = 10_000;
export const OWNER_STATUS_UNCERTAIN = "The public share link may have changed. Check show status before making more changes. Your browser draft is kept.";

/** A receipt must describe this exact show and a known lifecycle, not just exist. */
export function readLifecycleShow(value: unknown, expected: Pick<ManagedShow, "id" | "slug">): ManagedShow | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const show = value as Record<string, unknown>;
  if (show.id !== expected.id || show.slug !== expected.slug
    || typeof show.status !== "string" || !["draft", "published", "archived"].includes(show.status)
    || typeof show.isDefault !== "boolean") return null;
  for (const field of ["id", "slug", "title", "venue", "showDate", "date", "startTime", "endTime", "hours", "expectedWrap"]) {
    if (typeof show[field] !== "string") return null;
  }
  if (!(show.title as string).trim()) return null;
  return show as ManagedShow;
}

export function verifiedLifecycleNotice(show: ManagedShow): string {
  if (show.status === "published") return `${show.title} is public at its saved share link.`;
  if (show.status === "archived") return `${show.title} is archived. Its public share link is now closed.`;
  return `${show.title} is a draft. Its public share link is closed.`;
}
