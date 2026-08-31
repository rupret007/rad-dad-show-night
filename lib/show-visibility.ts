export type ShowReadScope = "public" | "owner";

export class ShowNotFoundError extends Error {
  constructor() {
    super("Show not found.");
    this.name = "ShowNotFoundError";
  }
}

export function canReadShowStatus(
  status: string,
  scope: ShowReadScope,
): boolean {
  return scope === "owner" || status === "published";
}

export function requireVisibleShow<T extends { status: string }>(
  show: T | undefined,
  scope: ShowReadScope,
): T {
  if (!show || !canReadShowStatus(show.status, scope)) {
    throw new ShowNotFoundError();
  }
  return show;
}

export function isShowNotFoundError(error: unknown): error is ShowNotFoundError {
  return error instanceof ShowNotFoundError;
}
