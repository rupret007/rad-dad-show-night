export const SHOW_NIGHT_ROLE = "live_set_surface" as const;
export const VAULT_ROLE = "catalog" as const;
export const RADDAD_SITE_ROLE = "public_site" as const;
export const STORYBOARD_ROLE = "band_os" as const;

export const PUBLIC_SITE_URL = "https://www.raddadband.com";
export const PUBLIC_SITE_LABEL = "Public band site";

export const SHOW_NIGHT_DOES_NOT_EXPAND_VAULT = true;
export const ORIGINALS_HIDE_PUBLIC_RESOURCES = true;
export const MISSING_MEDIA_FAILS_CLOSED = true;
export const OFFICIAL_SET_MEDIA_IS_SAVED_ONLY = true;
export const COVERS_WALL_IS_NOT_THE_SET = true;
export const NEVER_AUTO_POST = true;
export const TRAVIS_BOOKS = true;
export const CLONES_CANNOT_INHERIT_ANOTHER_SHOW_SET = true;
export const FAN_AND_BAND_KNOW_NEXT_ACTION = true;

export const PUBLIC_SUGGESTION_WRITER = "POST /api/suggestions";
export const OFFICIAL_SET_WRITER = "POST /api/show";

export const LIVE_SET_SLUGS = [
  "jeff-story-friends",
  "stalemate",
  "rad-dad",
] as const;

export const SURFACE_ROLES = {
  showNight: SHOW_NIGHT_ROLE,
  vault: VAULT_ROLE,
  radDadSite: RADDAD_SITE_ROLE,
  storyBoard: STORYBOARD_ROLE,
} as const;
