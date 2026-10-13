# vendor/braces

Local copy of [micromatch/braces](https://github.com/micromatch/braces) at merge
commit `2f2eb935a1afa189ab95aed83a09d2ba4def848f` (PR #72, CVE-2026-93687 /
GHSA-vfj7-8cjw-p6xm).

Upstream has not published a patched npm release. Published braces is still
`<= 3.0.3`, which leftover-honesty's `npm audit --audit-level=high` rejects.
This tree is the merged depth-guard fix, versioned `3.0.4` only so the audit
database can treat it as outside `<= 3.0.3`. Replace with the official npm
release once it exists.

Runtime files only (`index.js`, `lib/`, MIT license). No tests or benches.
