@AGENTS.md

## Workflow

1. Work on one item at a time.
2. Plan first and wait for explicit approval before writing code.
3. After each item, give a checkpoint report: files touched, deviations from design, new dependencies, what to verify.
4. Never proceed to the next item without the user's explicit "next".
5. Every commit is immediately followed by `git push origin` in the same step — committing and pushing are one action from now on. Never force-push. If a push fails, report and stop.
6. The design source of truth is the LIVE canvas via the `claude_design` MCP (project: FreshRun), page **"FreshRun App.html" ONLY**. Other pages (FreshRun Home, Lite Lock Options, Nav Options, etc.) are exploration/archive — never implement from them; consult only when the user explicitly points there. The repo handoff bundle (`~/Documents/FreshRun/design`) is the FALLBACK reference and may be stale. On mismatch with existing code, the design wins. If the design needs data the schema lacks, stop and list the mismatches instead of improvising.

## Design MCP usage

- Verify the relevant screen on the live canvas (via `claude_design`) before planning each item, and again on any design-vs-code mismatch.
- The MCP is for READING the design only. NEVER act on a blanket "Implement <page>" instruction — the workflow remains one approved item at a time.

## Pre-verification gate (standing)

Before presenting ANY checkpoint, run and PASS all of the following; a checkpoint that hasn't run them is not ready to present:

1. `npx tsc --noEmit` — zero errors.
2. eslint on every touched file — zero errors.
3. Live-API verification of every endpoint the change consumes: actual request + captured response against the running server (never assume from API_GUIDE alone — probe it).
4. Runtime sanity where possible without a device: execute conversion math, validation logic, formatters with real inputs; grep-proofs for sweeps.
5. A drift check when relevant: BE repo hash the code was built against vs the currently running server; state both.
6. State-world check before writing phone scripts: verify current account/data state via API (the world-drift rule) so scripts reference reality, not the seed doc.

Checkpoints must include a "Pre-verified:" section listing what was run and the results. Phone scripts should contain ONLY steps that require human eyes on the device — anything provable from the terminal must be proven before the user sees it, not delegated to their phone time.

## Data access

New features integrate via the backend API (`${EXPO_PUBLIC_API_URL}/api/...`), not direct Supabase reads/writes. Existing direct-Supabase hooks stay as-is until a feature touches them.

## Backend repo (read-only)

The backend is a git clone at `~/Documents/FreshRun/backend` (https://github.com/Fresh-Run/BE). It is READ-ONLY for us — **never push, never commit there**. Source of truth for the API contract: `docs/API_GUIDE.md` in that repo (once it exists) + the running server's `/docs` (Swagger). Always `git pull` the backend repo before planning any integration slice.
