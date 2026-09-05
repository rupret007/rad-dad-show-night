# Suggestion recovery — product handoff

Codex Astra Ultra, September 4, 2026 (America/Chicago).
Base: `ec9a70240af766743bea5d5905a42002890de0ca`, after #19.
Branch: `codex/show-night-audience-product-20260904`.
Coordination: [Bob-the-Bot #11](https://github.com/rupret007/Bob-the-Bot/issues/11).
This is source for a draft review, not a live Sites deployment.

## Completed product change

- Guests can search the existing community ideas before composing a suggestion;
  the phone reading order starts with discovery, with a direct jump to the form.
- Failed or malformed feed reads say unavailable. Last checked ideas stay
  visible, and a valid empty feed is distinguished from a failed check.
- Draft fields are controlled, retained, and locked while sending or checking
  uncertain delivery. A duplicate identifies the existing idea without erasing
  the guest's text. No success row is fabricated.
- A Form HTTP response is only an awaiting-board receipt. A later read started
  after that attempt settles must match all five submitted fields before the
  draft is cleared. Late reads cannot confirm arrival or authorize a retry.
- Unknown delivery never auto-resends or promotes the backup form. A further
  attempt requires a fresh absence check and explicit duplicate-risk acceptance.
  Starting a different idea requires an additional warning and returns keyboard
  focus to the title field after the old draft is explicitly cleared.
- Show Control's suggestion inbox no longer blocks otherwise verified official
  sets. It retains stale ideas on error but disables copying them until refresh.
  Adding an idea still changes only the owner's local draft until separate Save.

## Reused architecture and important limits

The existing Form/Sheet integration, sanitizer, original-song marker, public
network allowlist, owner editor, and official-set isolation are retained. No
new database, provider, settings, or credentials were added.

The five-column CSV is streamed with a 512 KiB / 1,000-row cap and six-second
deadline. Changed shape, bad data, or unavailable preflight stops a new write.
Form writes have an eight-second server deadline; the client allows twenty
seconds for preflight plus write. A cover cannot place the reserved `[ORIGINAL]`
marker first in its notes; the validation tells the guest what to correct.

This is **not exactly-once delivery**. Google Forms and the response Sheet do
not offer a transactional read/write here. Two visitors can pass preflight at
the same time, and the Sheet can lag. Drafts and last checked rows live only in
the open page; they are not retained after a reload or page close. The board is
shared community ideas for future shows, not a per-show set change request.

## Verification and scope of evidence

Local final result: production build, **102/102 offline tests**, **18/18 Chromium
tests**, lint, focused types, and local D1/HTTP isolation all pass. Desktop and
390px-phone fixture screenshots were inspected; the 320px long-content test
also passes. The production-only dependency audit reports zero vulnerabilities.

- `npm test`: real Vinext production build plus the full offline isolation suite.
- `npm run lint` and `npm run typecheck:suggestions`: all source lint and focused
  strict types for the touched suggestion/owner-inbox paths and browser harness.
- `npm run test:browser`: actual React components with fixture API interception;
  includes failures, duplicate and receipt handling, deadlines, initial-load
  cancellation, late reads, keyboard recovery, and phone layout.
- `npm run leftover:hosted`: existing local D1/HTTP proof that empty clones and
  closed shows cannot inherit the canonical show's data.

The browser harness is test-only. It does not start application API routes,
Cloudflare, authentication, or live providers. It blocks unmocked API requests
and external services; its `next/link` shim checks component behavior, not live
routing. Only the test Vite server's exact local WebSocket is allowed.
Hosted Actions now run these additional checks alongside the existing isolation
checks. The draft PR / coord AFTER record the final tip and hosted run.

The optional full standalone `npx tsc --noEmit` is **not green**: the same nine
diagnostics reproduce from an untouched archive of the exact base. They concern
missing `cloudflare:workers`, `Fetcher` and `D1Database` declarations, a missing
`ShowNotFoundError` name, and existing timeline literal/readonly types in
`lib/show-store.ts`. This slice neither hides nor changes those files. The
focused check is additive; it does not replace a previously green full check.

## Remaining / next owner

Karen reviews the exact draft tip and its green Actions run. Jeff owns any
later merge and Sites deployment. Neither a branch push nor PR opening updates
the live Sites app. Live Google Form/Sheet delivery and owner sign-in were not
tested because this session was fixtures/local only; do not claim they were.
Before a later approved live check, account for the existing Sheet schema and
possible response lag instead of submitting repeat test ideas.

`lib/show-data.ts` remains blob `7ff0a69708ccfac79aa9b35878670f31bbb83b64`.
Travis still books; automated outreach and public posting stay prohibited. Official-set data, media,
owner-write gates, empty-clone behavior, and #19's first-open next action are
unchanged. No merge, tag, release, deploy, spend, live submission, or credential
change belongs to this handoff.
